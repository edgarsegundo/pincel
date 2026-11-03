import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { AiCoordinator } = await import('./coordinator');
const { AiError } = await import('./provider');
import type { ShapeVerdict } from '../../../server/types';

const req: any = { v: 1, features: {}, local_scores: {}, outline: [] };
const verdict: ShapeVerdict = { shape: 'rectangle', confidence: 0.9, probabilities: {}, deliberate: 0.9, model: 'm' };
const job = (id: string, isIntact = () => true) => ({ id, request: req, anchor: [0, 0] as [number, number], isIntact });

function setup(classify: (r: any, s: AbortSignal) => Promise<ShapeVerdict>, enabled = () => true) {
  let clock = 0;
  const c = new AiCoordinator({ provider: () => ({ classify }), enabled, now: () => clock });
  return { c, tick: (ms: number) => { clock += ms; } };
}

test('devolve o veredito quando o traço continua intacto', async () => {
  const { c } = setup(async () => verdict);
  expect(await c.ask(job('a'))).toEqual(verdict);
  expect(c.pending.size).toBe(0);
});

test('resposta que chega com o traço alterado é descartada em silêncio', async () => {
  let intact = true;
  const { c } = setup(async () => { intact = false; return verdict; });
  expect(await c.ask(job('a', () => intact))).toBeNull();
});

test('um pedido por traço: a segunda chamada reaproveita a primeira', async () => {
  const classify = vi.fn(async () => verdict);
  const { c } = setup(classify);
  const [a, b] = await Promise.all([c.ask(job('a')), c.ask(job('a'))]);
  expect(a).toEqual(b);
  expect(classify).toHaveBeenCalledTimes(1);
});

test('no máximo 2 pedidos simultâneos; o terceiro espera', async () => {
  const gates: Array<() => void> = [];
  let running = 0, peak = 0;
  const { c } = setup(() => new Promise<ShapeVerdict>((res) => { running++; peak = Math.max(peak, running); gates.push(() => { running--; res(verdict); }); }));
  const all = Promise.all([c.ask(job('a')), c.ask(job('b')), c.ask(job('c'))]);
  await Promise.resolve();
  expect(gates.length).toBe(2);
  gates[0]!();
  await new Promise((r) => setTimeout(r, 0));
  expect(gates.length).toBe(3);
  gates[1]!(); gates[2]!();
  await all;
  expect(peak).toBe(2);
});

test('abortStale cancela o pedido quando o traço muda', async () => {
  let intact = true;
  let aborted = false;
  const { c } = setup((_r, signal) => new Promise((_res, rej) => signal.addEventListener('abort', () => { aborted = true; rej(new AiError('aborted')); })));
  const p = c.ask(job('a', () => intact));
  intact = false;
  c.abortStale();
  expect(await p).toBeNull();
  expect(aborted).toBe(true);
});

test('disjuntor: 3 falhas seguidas pausam a IA por 60 s', async () => {
  const classify = vi.fn(async () => { throw new AiError('transient'); });
  const { c, tick } = setup(classify as any);
  for (const id of ['a', 'b', 'c']) expect(await c.ask(job(id))).toBeNull();
  expect(c.available).toBe(false);
  expect(await c.ask(job('d'))).toBeNull();
  expect(classify).toHaveBeenCalledTimes(3); // o quarto nem saiu do navegador
  tick(61_000);
  expect(c.available).toBe(true);
});

test('not_configured desliga a IA na sessão (não insiste)', async () => {
  const classify = vi.fn(async () => { throw new AiError('not_configured'); });
  const { c } = setup(classify as any);
  await c.ask(job('a'));
  expect(c.available).toBe(false);
  await c.ask(job('b'));
  expect(classify).toHaveBeenCalledTimes(1);
});

test('desligada nas configurações: nada é enviado', async () => {
  const classify = vi.fn(async () => verdict);
  const { c } = setup(classify, () => false);
  expect(await c.ask(job('a'))).toBeNull();
  expect(classify).not.toHaveBeenCalled();
});

test('sucesso zera a contagem de falhas', async () => {
  let n = 0;
  const { c } = setup(async () => { if (n++ % 2 === 0) throw new AiError('transient'); return verdict; });
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) await c.ask(job(id));
  expect(c.available).toBe(true);
});
