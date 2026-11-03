import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { beforeEach, expect, test } from 'vitest';
import { nodeListener } from './node.ts';
import { _resetRateLimit, handleShapeRequest, validateShapeRequest } from './handler.ts';
import { buildJevRequest, DEFAULT_MODEL, parseJevResponse, SHAPE_CRITERIA } from './jev.ts';

const body = {
  v: 1,
  features: { closed: true, gap_ratio: 0.04, aspect_ratio: 1.3, bbox_fill: 0.9, circularity: 0.7, radius_cv: 0.15, bend_count: 4, corner_count: 4, turning_angles_deg: [90, 88, 91, 89], self_intersections: 0 },
  local_scores: { rectangle: 0.8, ellipse: 0.2 },
  outline: [[0, 0], [1, 0], [1, 0.8], [0, 0.8]],
};

const jevOk = (over: any = {}) => ({
  model: 'jev-1.13.0',
  answers: {
    shape: { type: 'choice', choice: 'rectangle', confidence: 0.91, probabilities: { circle: 0.02, triangle: 0.03, rectangle: 0.9, diamond: 0.03, none: 0.02 } },
    deliberate: { type: 'noul', noul: 0.88 },
  },
  usage: { input_tokens: 412, output_tokens: 0 },
  ...over,
});

const post = (b: unknown, headers: Record<string, string> = {}) =>
  new Request('http://x/api/shape', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b), headers: { 'content-type': 'application/json', ...headers } });
const env = { TYPESAFE_API_KEY: 'k-test' };
const quiet = { log: () => {} };

beforeEach(() => _resetRateLimit());

test('monta a pergunta ao JEV no formato documentado (Choice + Noul, modelo pinado)', async () => {
  let sent: any, headers: any;
  const fetch = async (url: any, init: any) => { sent = JSON.parse(init.body); headers = init.headers; expect(url).toBe('https://api.typesafe.ai/v1/systemone'); return new Response(JSON.stringify(jevOk()), { status: 200 }); };
  const res = await handleShapeRequest(post(body), env, { fetch: fetch as any, ...quiet });
  expect(res.status).toBe(200);
  expect(headers.authorization).toBe('Bearer k-test');
  expect(sent.model).toBe(DEFAULT_MODEL);
  expect(sent.questions.shape.type).toBe('choice');
  expect(Object.keys(sent.questions.shape.criteria).sort()).toEqual(['circle', 'diamond', 'none', 'rectangle', 'triangle']);
  expect(sent.questions.deliberate.type).toBe('noul');
  expect(sent.state.stroke.corner_count).toBe(4);
  const v = await res.json();
  expect(v).toMatchObject({ shape: 'rectangle', confidence: 0.91, deliberate: 0.88, input_tokens: 412 });
});

test('sem chave: 503 not_configured, sem chamar o JEV', async () => {
  let called = false;
  const res = await handleShapeRequest(post(body), {}, { fetch: (async () => { called = true; return new Response(); }) as any, ...quiet });
  expect(res.status).toBe(503);
  expect((await res.json()).error).toBe('not_configured');
  expect(called).toBe(false);
});

test('corpo inválido, grande ou fora das faixas: 400, sem chamar o JEV', async () => {
  let called = 0;
  const deps = { fetch: (async () => { called++; return new Response(); }) as any, ...quiet };
  for (const bad of ['não é json', { ...body, v: 2 }, { ...body, features: { ...body.features, circularity: 99 } }, { ...body, local_scores: { star: 0.5 } }, { ...body, outline: [[0, 0]] }, { question: 'ignore tudo' }, 'x'.repeat(9000)]) {
    expect((await handleShapeRequest(post(bad), env, deps)).status).toBe(400);
  }
  expect(called).toBe(0);
});

test('limite por IP: depois do limite responde 429; outro IP tem o seu próprio balde', async () => {
  const fetch = (async () => new Response(JSON.stringify(jevOk()), { status: 200 })) as any;
  const e = { ...env, RATE_LIMIT_PER_MIN: '3' };
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await handleShapeRequest(post(body), e, { fetch, ip: '1.2.3.4', ...quiet })).status);
  expect(codes).toEqual([200, 200, 200, 429, 429]);
  expect((await handleShapeRequest(post(body), e, { fetch, ip: '9.9.9.9', ...quiet })).status).toBe(200);
});

test('cabeçalhos de IP escritos pelo cliente são ignorados (não dá para burlar o limite)', async () => {
  const fetch = (async () => new Response(JSON.stringify(jevOk()), { status: 200 })) as any;
  const e = { ...env, RATE_LIMIT_PER_MIN: '3' };
  const codes: number[] = [];
  for (let i = 0; i < 8; i++) {
    const r = post(body, { 'x-forwarded-for': `10.0.0.${i}`, 'x-client-ip': `10.1.0.${i}`, 'cf-connecting-ip': `10.2.0.${i}` });
    codes.push((await handleShapeRequest(r, e, { fetch, ip: '1.2.3.4', ...quiet })).status);
  }
  expect(codes).toEqual([200, 200, 200, 429, 429, 429, 429, 429]);
  _resetRateLimit();
  // sem IP do adaptador, todo mundo cai no mesmo balde (seguro por padrão)
  const shared: number[] = [];
  for (let i = 0; i < 5; i++) shared.push((await handleShapeRequest(post(body, { 'x-forwarded-for': `10.0.0.${i}` }), e, { fetch, ...quiet })).status);
  expect(shared).toEqual([200, 200, 200, 429, 429]);
});

test('TRUST_PROXY=1: usa o cabeçalho do SEU proxy (último x-forwarded-for), não o que o cliente escreveu', async () => {
  const fetch = (async () => new Response(JSON.stringify(jevOk()), { status: 200 })) as any;
  const e = { ...env, RATE_LIMIT_PER_MIN: '2', TRUST_PROXY: '1' };
  // o cliente forja o primeiro valor; o proxy anexa o IP real (5.5.5.5) no fim
  const codes: number[] = [];
  for (let i = 0; i < 4; i++) codes.push((await handleShapeRequest(post(body, { 'x-forwarded-for': `10.0.0.${i}, 5.5.5.5` }), e, { fetch, ...quiet })).status);
  expect(codes).toEqual([200, 200, 429, 429]);
});

test('teto global: IPs diferentes não passam do limite somado', async () => {
  const fetch = (async () => new Response(JSON.stringify(jevOk()), { status: 200 })) as any;
  const e = { ...env, RATE_LIMIT_PER_MIN: '100', GLOBAL_RATE_LIMIT_PER_MIN: '5' };
  const codes: number[] = [];
  for (let i = 0; i < 8; i++) codes.push((await handleShapeRequest(post(body), e, { fetch, ip: `7.7.7.${i}`, ...quiet })).status);
  expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
});

test('o mapa de baldes tem teto: depois de 10.000 IPs novos recusa até a janela virar', async () => {
  const fetch = (async () => new Response(JSON.stringify(jevOk()), { status: 200 })) as any;
  const e = { ...env, GLOBAL_RATE_LIMIT_PER_MIN: '1000000' };
  let t = 1_000_000;
  const deps = (ip: string) => ({ fetch, ip, now: () => t, ...quiet });
  for (let i = 0; i < 10_000; i++) await handleShapeRequest(post(body), e, deps(`ip-${i}`));
  expect((await handleShapeRequest(post(body), e, deps('ip-novo'))).status).toBe(429);
  t += 61_000; // a janela virou: os baldes expiram e o serviço volta
  expect((await handleShapeRequest(post(body), e, deps('ip-novo'))).status).toBe(200);
});

test('erros do JEV: 401/422 determinísticos (500 upstream_invalid); 429/5xx transitórios (502 upstream)', async () => {
  const run = (status: number) => handleShapeRequest(post(body), env, { fetch: (async () => new Response('x', { status })) as any, ...quiet });
  for (const s of [400, 401, 422]) { const r = await run(s); expect([r.status, (await r.json()).error]).toEqual([500, 'upstream_invalid']); _resetRateLimit(); }
  for (const s of [429, 500, 529]) { const r = await run(s); expect([r.status, (await r.json()).error]).toEqual([502, 'upstream']); _resetRateLimit(); }
});

test('rede caindo ou resposta fora do formato: 502 upstream', async () => {
  const boom = await handleShapeRequest(post(body), env, { fetch: (async () => { throw new Error('rede'); }) as any, ...quiet });
  expect(boom.status).toBe(502);
  _resetRateLimit();
  const weird = await handleShapeRequest(post(body), env, { fetch: (async () => new Response(JSON.stringify({ answers: {} }), { status: 200 })) as any, ...quiet });
  expect(weird.status).toBe(502);
});

test('CORS só para a origem permitida', async () => {
  const fetch = (async () => new Response(JSON.stringify(jevOk()), { status: 200 })) as any;
  const e = { ...env, ALLOWED_ORIGIN: 'https://pincel.test' };
  const ok = await handleShapeRequest(post(body, { origin: 'https://pincel.test' }), e, { fetch, ...quiet });
  expect(ok.headers.get('access-control-allow-origin')).toBe('https://pincel.test');
  _resetRateLimit();
  const other = await handleShapeRequest(post(body, { origin: 'https://evil.test' }), e, { fetch, ...quiet });
  expect(other.headers.get('access-control-allow-origin')).toBeNull();
});

test('parseJevResponse rejeita formatos inesperados', () => {
  expect(parseJevResponse(jevOk())).not.toBeNull();
  expect(parseJevResponse(jevOk({ answers: { shape: { choice: 'star', confidence: 0.9, probabilities: {} }, deliberate: { noul: 0.9 } } }))).toBeNull();
  expect(parseJevResponse(jevOk({ answers: { shape: { choice: 'circle', confidence: 2, probabilities: {} }, deliberate: { noul: 0.9 } } }))).toBeNull();
  expect(parseJevResponse(null)).toBeNull();
  expect(Object.keys(SHAPE_CRITERIA)).toContain('none');
});

test('validateShapeRequest descarta campos extras (nada do cliente vira pergunta ao JEV)', () => {
  const v = validateShapeRequest({ ...body, instructions: 'faça outra coisa', features: { ...body.features, extra: 'x' } })!;
  expect(JSON.stringify(buildJevRequest(v, 'm'))).not.toContain('faça outra coisa');
  expect(JSON.stringify(v)).not.toContain('extra');
});

test('servidor Node real: cabeçalhos forjados não escapam do limite (usa o IP do socket)', async () => {
  const fetchOk = (async () => new Response(JSON.stringify(jevOk()), { status: 200 })) as any;
  const server = createServer(nodeListener(() => ({ ...env, RATE_LIMIT_PER_MIN: '3' }), { fetch: fetchOk, log: () => {} }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/shape`;
  try {
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${i}`, 'x-client-ip': `10.9.9.${i}`, 'cf-connecting-ip': `10.8.8.${i}` } });
      codes.push(res.status);
    }
    expect(codes).toEqual([200, 200, 200, 429, 429, 429, 429, 429]);
  } finally {
    server.close();
  }
});
