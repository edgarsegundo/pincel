/**
 * Proxy do JEV: a chave NUNCA vai ao navegador. Usa só a API padrão Request/Response, então roda em
 * Node 18+, Cloudflare Workers, Vercel/Netlify Functions e Deno com um adaptador de poucas linhas.
 *
 * Por segurança o proxy NÃO repassa perguntas do cliente: aceita apenas o formato exato do Pincel
 * (características numéricas do traço) e monta ele mesmo a pergunta ao JEV. Assim a chave não serve
 * para outra coisa, mesmo se alguém chamar o endpoint direto.
 */
import { buildJevRequest, DEFAULT_MODEL, JEV_URL, parseJevResponse, PROMPT_VERSION } from './jev.ts';
import type { ProxyError, ShapeRequest } from './types.ts';

export interface Env {
  TYPESAFE_API_KEY?: string;
  JEV_MODEL?: string;
  /** Origem permitida para CORS (ex.: https://pincel.app). Vazio = mesma origem apenas. */
  ALLOWED_ORIGIN?: string;
  /** Chamadas por minuto por IP (padrão 40). */
  RATE_LIMIT_PER_MIN?: string;
  /** Teto de chamadas por minuto somando todos os IPs (padrão 600): protege o custo da chave mesmo com IPs trocando. */
  GLOBAL_RATE_LIMIT_PER_MIN?: string;
  /**
   * "1" = confiar nos cabeçalhos de um proxy reverso que VOCÊ controla (cf-connecting-ip e o ÚLTIMO valor de
   * x-forwarded-for). Sem isso eles são ignorados: o cliente os controla e burlaria o limite por IP.
   */
  TRUST_PROXY?: string;
}

export interface Deps {
  /** IP de quem chamou, informado pelo ADAPTADOR (ex.: endereço do socket). Nunca lido de cabeçalhos do cliente. */
  ip?: string;
  fetch?: typeof fetch;
  now?: () => number;
  log?: (line: string) => void;
}

const MAX_BODY_BYTES = 8 * 1024;
const UPSTREAM_TIMEOUT_MS = 2500;

// Janelas fixas de 1 minuto, em memória (suficiente para um processo; use o limite da plataforma em escala).
const MAX_BUCKETS = 10_000;
const buckets = new Map<string, { count: number; resetAt: number }>();
const global = { count: 0, resetAt: 0 };
export const _resetRateLimit = () => { buckets.clear(); global.count = 0; global.resetAt = 0; };

function allowed(ip: string, limit: number, globalLimit: number, now: number) {
  // Teto global: vale mesmo se o atacante trocar de IP a cada chamada.
  if (now >= global.resetAt) { global.count = 0; global.resetAt = now + 60_000; }
  if (++global.count > globalLimit) return false;

  let b = buckets.get(ip);
  if (!b || now >= b.resetAt) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
      if (buckets.size >= MAX_BUCKETS) return false; // memória protegida: recusa IPs novos até a janela virar
    }
    b = { count: 0, resetAt: now + 60_000 };
    buckets.set(ip, b);
  }
  return ++b.count <= limit;
}

/** IP para o limite: o do adaptador; cabeçalhos de proxy só com TRUST_PROXY=1; senão um balde único (seguro por padrão). */
function clientIp(req: Request, env: Env, deps: Deps) {
  if (env.TRUST_PROXY === '1') {
    const cf = req.headers.get('cf-connecting-ip');
    if (cf) return cf;
    const xff = req.headers.get('x-forwarded-for')?.split(',').map((x) => x.trim()).filter(Boolean);
    if (xff?.length) return xff[xff.length - 1]!; // o que o SEU proxy anexou, não o que o cliente escreveu
  }
  return deps.ip ?? 'shared';
}

const isNum = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Valida estritamente o corpo: só números dentro de faixas plausíveis. */
export function validateShapeRequest(b: any): ShapeRequest | null {
  const f = b?.features;
  if (b?.v !== 1 || !f || typeof f !== 'object') return null;
  if (typeof f.closed !== 'boolean') return null;
  const ranges: [string, number, number][] = [
    ['gap_ratio', 0, 1.5], ['aspect_ratio', 1, 1000], ['bbox_fill', 0, 2], ['circularity', 0, 2],
    ['radius_cv', 0, 10], ['bend_count', 0, 200], ['corner_count', 0, 200], ['self_intersections', 0, 2000],
  ];
  for (const [k, lo, hi] of ranges) if (!isNum(f[k], lo, hi)) return null;
  if (!Array.isArray(f.turning_angles_deg) || f.turning_angles_deg.length > 16 || !f.turning_angles_deg.every((a: unknown) => isNum(a, 0, 180))) return null;
  const ls = b.local_scores;
  if (!ls || typeof ls !== 'object') return null;
  const local: Record<string, number> = {};
  for (const [k, v] of Object.entries(ls)) {
    if (!['line', 'rectangle', 'diamond', 'ellipse', 'triangle'].includes(k) || !isNum(v, 0, 1)) return null;
    local[k] = v as number;
  }
  if (!Array.isArray(b.outline) || b.outline.length < 2 || b.outline.length > 24) return null;
  if (!b.outline.every((p: unknown) => Array.isArray(p) && p.length === 2 && isNum(p[0], -0.5, 1.5) && isNum(p[1], -0.5, 1.5))) return null;
  return {
    v: 1,
    features: {
      closed: f.closed, gap_ratio: f.gap_ratio, aspect_ratio: f.aspect_ratio, bbox_fill: f.bbox_fill,
      circularity: f.circularity, radius_cv: f.radius_cv, bend_count: f.bend_count, corner_count: f.corner_count,
      turning_angles_deg: f.turning_angles_deg, self_intersections: f.self_intersections,
    },
    local_scores: local,
    outline: b.outline,
  };
}

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
}
const fail = (status: number, error: ProxyError, cors: Record<string, string>) => json(status, { error }, cors);

export async function handleShapeRequest(req: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((l: string) => console.log(l));
  const origin = req.headers.get('origin');
  const cors: Record<string, string> = {};
  if (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
    cors['access-control-allow-origin'] = origin;
    cors['access-control-allow-headers'] = 'content-type';
    cors['access-control-allow-methods'] = 'POST, OPTIONS';
    cors.vary = 'origin';
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail(405, 'bad_request', cors);

  // Falta de configuração é determinística: o cliente desliga a IA em vez de insistir.
  if (!env.TYPESAFE_API_KEY) return fail(503, 'not_configured', cors);

  const limit = Number(env.RATE_LIMIT_PER_MIN) || 40;
  const globalLimit = Number(env.GLOBAL_RATE_LIMIT_PER_MIN) || 600;
  if (!allowed(clientIp(req, env, deps), limit, globalLimit, now())) return fail(429, 'rate_limited', cors);

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return fail(400, 'bad_request', cors);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return fail(400, 'bad_request', cors); }
  const input = validateShapeRequest(parsed);
  if (!input) return fail(400, 'bad_request', cors);

  const model = env.JEV_MODEL || DEFAULT_MODEL;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  const t0 = now();
  let res: Response;
  try {
    res = await doFetch(JEV_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildJevRequest(input, model)),
      signal: ctrl.signal,
    });
  } catch {
    log(`[JEV] ${PROMPT_VERSION} falha de rede/timeout`);
    return fail(502, 'upstream', cors);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 400 || res.status === 401 || res.status === 422) {
    log(`[JEV] ${PROMPT_VERSION} requisição recusada HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return fail(500, 'upstream_invalid', cors); // determinístico: retry não resolve
  }
  if (res.status !== 200) {
    log(`[JEV] ${PROMPT_VERSION} HTTP ${res.status}`);
    return fail(502, 'upstream', cors); // 429/5xx/529: transitório
  }
  const verdict = parseJevResponse(await res.json().catch(() => null));
  if (!verdict) {
    log(`[JEV] ${PROMPT_VERSION} resposta inesperada`);
    return fail(502, 'upstream', cors);
  }
  log(`[JEV] ${PROMPT_VERSION} ${model} shape=${verdict.shape} conf=${verdict.confidence.toFixed(2)} deliberate=${verdict.deliberate.toFixed(2)} tokens=${verdict.input_tokens ?? '?'} ${now() - t0}ms`);
  return json(200, verdict, cors);
}
