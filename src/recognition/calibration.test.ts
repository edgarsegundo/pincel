import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { calibrate, MIN_NONE } = await import('./calibration');
const { rng, sample } = await import('./synthetic');
type Label = import('./synthetic').Label;

const shapes: Label[] = ['line', 'rectangle', 'diamond', 'ellipse', 'triangle'];
const make = (perShape: number, nones: number) => {
  const r = rng(7);
  const out: { label: string; points: number[] }[] = [];
  for (const l of shapes) for (let i = 0; i < perShape; i++) out.push({ label: l, points: sample(l, r) });
  for (let i = 0; i < nones; i++) out.push({ label: 'none', points: sample('none', r) });
  return out;
};

test('com poucos "none" não libera a ativação (a calibração poderia piorar o app)', () => {
  const res = calibrate(make(20, MIN_NONE - 1));
  expect(res.ready).toBe(false);
  expect(res.reason).toBe('few-none');
});

test('sem formas suficientes não libera a ativação', () => {
  const res = calibrate(make(2, 40));
  expect(res.ready).toBe(false);
  expect(res.reason).toBe('few-shapes');
});

test('calibrar não piora: mantém conversões indevidas ≤ 3% e dá limiares dentro do piso/teto', () => {
  const res = calibrate(make(30, 40));
  expect(res.ready).toBe(true);
  for (const th of Object.values(res.thresholds)) {
    expect(th).toBeGreaterThanOrEqual(0.8);
    expect(th).toBeLessThanOrEqual(0.97);
  }
  expect(res.after.falsePositive).toBeLessThanOrEqual(0.03);
  expect(res.after.recall).toBeGreaterThanOrEqual(res.before.recall - 0.05);
});

test('traços de "none" que parecem forma sobem o limiar daquela forma', () => {
  const r = rng(3);
  const data = make(30, 40);
  // 10 elipses desenhadas à mão que o usuário rotula como "não converter"
  for (let i = 0; i < 10; i++) data.push({ label: 'none', points: sample('ellipse', r) });
  const res = calibrate(data);
  expect(res.thresholds.ellipse).toBeGreaterThan(0.9);
});
