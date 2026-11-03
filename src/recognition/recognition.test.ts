import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { recognize } = await import('./decide');
const { rng, sample } = await import('./synthetic');
type Label = import('./synthetic').Label;

const shapes: Label[] = ['line', 'rectangle', 'diamond', 'ellipse', 'triangle'];

function run(trigger: 'release' | 'hold', perClass = 60) {
  const r = rng(42);
  const confusion: Record<string, Record<string, number>> = {};
  let correct = 0, total = 0, falsePositives = 0, negatives = 0;
  for (const label of [...shapes, 'none' as Label]) {
    for (let i = 0; i < perClass; i++) {
      const res = recognize(sample(label, r), trigger);
      const got = res?.type ?? 'none';
      (confusion[label] ??= {})[got] = ((confusion[label] ??= {})[got] ?? 0) + 1;
      if (label === 'none') { negatives++; if (got !== 'none') falsePositives++; }
      else { total++; if (got === label) correct++; }
    }
  }
  return { accuracy: correct / total, fpRate: falsePositives / negatives, confusion };
}

test('ao soltar: acerta ≥ 90% das formas e converte ≤ 3% dos traços livres', () => {
  const m = run('release');
  console.log('release', m.accuracy.toFixed(3), m.fpRate.toFixed(3), JSON.stringify(m.confusion));
  expect(m.accuracy).toBeGreaterThanOrEqual(0.9);
  expect(m.fpRate).toBeLessThanOrEqual(0.03);
});

test('ao segurar: limiar menor reconhece ≥ 95%', () => {
  const m = run('hold');
  console.log('hold', m.accuracy.toFixed(3), JSON.stringify(m.confusion));
  expect(m.accuracy).toBeGreaterThanOrEqual(0.95);
});
