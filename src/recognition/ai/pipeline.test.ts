import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { handleShapeRequest, _resetRateLimit } = await import('../../../server/handler');
const { prepareAiRequest } = await import('./request');
const { buildDataset } = await import('./dataset');
const { fakeJev, fakeFetch } = await import('./fake-jev');


test('pipeline completo: separa círculo, retângulo, triângulo e losango de pentágono/estrela/oito', async () => {
  const items = buildDataset(30);
  let n = 0, correct = 0, eligible = 0, negAccepted = 0, negTotal = 0, tokens = 0;
  const misses: string[] = [];
  for (const it of items) {
    const req = prepareAiRequest(it.points);
    if (!req) continue;
    eligible++;
    _resetRateLimit();
    const res = await handleShapeRequest(
      new Request('http://x/api/shape', { method: 'POST', body: JSON.stringify(req) }),
      { TYPESAFE_API_KEY: 'k' }, { fetch: fakeFetch, log: () => {} },
    );
    expect(res.status).toBe(200);
    const v = await res.json();
    tokens += v.input_tokens ?? 0;
    if (it.label === 'none') { negTotal++; if (v.shape !== 'none') { negAccepted++; misses.push(`${it.kind}→${v.shape}`); } }
    else { n++; if (v.shape === it.label) correct++; else misses.push(`${it.label}→${v.shape}`); }
  }
  console.log(`PIPELINE elegíveis ${eligible}/${items.length} · acerto nas formas ${(100 * correct / n).toFixed(1)}% · falsos positivos ${negAccepted}/${negTotal} · erros: ${misses.join(', ') || 'nenhum'}`);
  expect(eligible).toBeGreaterThan(items.length * 0.8);
  expect(correct / n).toBeGreaterThan(0.9);
  expect(negAccepted / negTotal).toBeLessThanOrEqual(0.1);
  expect(tokens).toBeGreaterThan(0);
});

test('o pedido enviado é pequeno (barato e rápido)', () => {
  const req = prepareAiRequest(buildDataset(1)[1]!.points)!;
  expect(JSON.stringify(req).length).toBeLessThan(900);
});
