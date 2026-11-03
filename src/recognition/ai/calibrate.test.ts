/**
 * Calibração com o JEV de verdade (mesma ideia do `testar_nome_jev` do projeto emprego).
 * NÃO roda nos testes normais. Faz chamadas pagas (muito baratas: ~US$ 0,00003 por traço).
 *
 *   npm run jev:calibrate          # JEV real (exige TYPESAFE_API_KEY em .env.local)
 *   npm run jev:calibrate:mock     # só valida o encanamento, sem rede
 *   JEV_N=60 npm run jev:calibrate # traços por classe (padrão 40)
 */
import { loadEnv } from 'vite';
import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const mode = process.env.JEV_CALIBRATE;
const { handleShapeRequest, _resetRateLimit } = await import('../../../server/handler');
const { prepareAiRequest } = await import('./request');
const { buildDataset } = await import('./dataset');
const { fakeFetch } = await import('./fake-jev');
type Verdict = import('../../../server/types').ShapeVerdict;

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');
const out = (s = '') => process.stdout.write(s + '\n');

test.skipIf(!mode)('calibração do JEV: formas básicas + losango', async () => {
  const env = loadEnv('development', process.cwd(), '');
  const key = process.env.TYPESAFE_API_KEY ?? env.TYPESAFE_API_KEY;
  if (mode === '1') expect(key, 'defina TYPESAFE_API_KEY em .env.local').toBeTruthy();
  const proxyEnv = { TYPESAFE_API_KEY: key ?? 'mock', JEV_MODEL: process.env.JEV_MODEL ?? env.JEV_MODEL, RATE_LIMIT_PER_MIN: '100000' };
  const deps = { log: () => {}, fetch: mode === 'mock' ? fakeFetch : undefined };

  const items = buildDataset(Number(process.env.JEV_N) || 40);
  const rows: { truth: string; kind: string; v: Verdict; ms: number }[] = [];
  let ineligible = 0, errors = 0;
  for (const it of items) {
    const req = prepareAiRequest(it.points);
    if (!req) { ineligible++; continue; }
    _resetRateLimit();
    const t0 = performance.now();
    const res = await handleShapeRequest(new Request('http://x/api/shape', { method: 'POST', body: JSON.stringify(req) }), proxyEnv, deps);
    const ms = performance.now() - t0;
    if (res.status !== 200) { errors++; out(`  erro ${res.status} ${(await res.text()).slice(0, 120)}`); continue; }
    rows.push({ truth: it.label, kind: it.kind, v: (await res.json()) as Verdict, ms });
  }

  out(`\n=== Calibração (${mode === 'mock' ? 'SIMULADO' : 'JEV real'}) · ${rows.length} traços · ${ineligible} inelegíveis · ${errors} erros`);
  out(`modelo: ${rows[0]?.v.model}`);

  const labels = ['circle', 'rectangle', 'triangle', 'diamond', 'none'];
  out('\nMatriz de confusão (linha = verdade, coluna = veredito do JEV):');
  out('            ' + labels.map((l) => l.padStart(10)).join(''));
  for (const t of labels) out(t.padEnd(12) + labels.map((l) => String(rows.filter((r) => r.truth === t && r.v.shape === l).length).padStart(10)).join(''));

  const wrong: Record<string, number[]> = {};
  for (const r of rows) if (r.truth !== r.v.shape) (wrong[`${r.kind}→${r.v.shape}`] ??= []).push(r.v.confidence);
  out('\nErros por tipo de traço (verdade→veredito: quantidade, confiança média):');
  for (const [k, c] of Object.entries(wrong)) out(`  ${k.padEnd(22)} ${String(c.length).padStart(3)}  conf ${(c.reduce((a, b) => a + b, 0) / c.length).toFixed(2)}`);

  const positives = rows.filter((r) => r.truth !== 'none').length;
  out('\nLimiares (aceita se shape≠none, confiança ≥ c e proposital ≥ d):');
  out('   c     d    aceitos  precisão  cobertura');
  let best: { c: number; d: number; precision: number; recall: number } | null = null;
  for (const c of [0.5, 0.6, 0.7, 0.8, 0.9]) for (const d of [0.5, 0.6, 0.7]) {
    const acc = rows.filter((r) => r.v.shape !== 'none' && r.v.confidence >= c && r.v.deliberate >= d);
    const ok = acc.filter((r) => r.v.shape === r.truth).length;
    const precision = acc.length ? ok / acc.length : 1, recall = ok / (positives || 1);
    out(`${c.toFixed(1).padStart(5)} ${d.toFixed(1).padStart(5)} ${String(acc.length).padStart(8)} ${pct(ok, acc.length).padStart(9)} ${pct(ok, positives).padStart(10)}`);
    if (precision >= 0.97 && (!best || recall > best.recall)) best = { c, d, precision, recall };
  }
  out(best ? `\nSugestão (precisão ≥ 97%): aiThreshold=${best.c}, aiDeliberate=${best.d} → cobertura ${(best.recall * 100).toFixed(0)}%` : '\nNenhuma combinação chegou a 97% de precisão: reveja as perguntas/critérios (server/jev.ts) antes de ligar.');

  const tokens = rows.reduce((a, r) => a + (r.v.input_tokens ?? 0), 0);
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  out(`\nTokens de entrada: ${(tokens / (rows.length || 1)).toFixed(0)} por traço · custo ≈ US$ ${((tokens * 42) / 1e9).toFixed(5)} no total (US$ 42 por bilhão)`);
  out(`Latência (proxy + JEV): p50 ${ms[Math.floor(ms.length / 2)]?.toFixed(0)} ms · p95 ${ms[Math.floor(ms.length * 0.95)]?.toFixed(0)} ms`);
  expect(rows.length).toBeGreaterThan(0);
}, 900_000);
