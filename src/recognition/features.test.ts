import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { prepare } = await import('./prepare');
const { strokeFeatures, buildShapeRequest } = await import('./features');
const { rng, sample } = await import('./synthetic');

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;

function featuresOf(label: Parameters<typeof sample>[0], n = 40) {
  const r = rng(11);
  return Array.from({ length: n }, () => strokeFeatures(prepare(sample(label, r))!));
}

test('retângulo: 4 cantos de ~90°, caixa bem preenchida', () => {
  const f = featuresOf('rectangle');
  expect(median(f.map((x) => x.corner_count))).toBe(4);
  expect(median(f.map((x) => x.bbox_fill))).toBeGreaterThan(0.8);
});

test('triângulo: 3 cantos, ~metade da caixa', () => {
  const f = featuresOf('triangle');
  expect(median(f.map((x) => x.corner_count))).toBe(3);
  const fill = median(f.map((x) => x.bbox_fill));
  expect(fill).toBeGreaterThan(0.35);
  expect(fill).toBeLessThan(0.65);
});

test('elipse: quase sem cantos, caixa bem preenchida e viradas pequenas', () => {
  const f = featuresOf('ellipse');
  expect(median(f.map((x) => x.corner_count))).toBeLessThanOrEqual(1);
  expect(median(f.map((x) => x.bbox_fill))).toBeGreaterThan(0.7);
  expect(median(f.map((x) => x.circularity))).toBeGreaterThan(0.78);
});

test('a requisição é compacta e normalizada', () => {
  const req = buildShapeRequest(prepare(sample('rectangle', rng(3)))!, { rectangle: 0.8123, ellipse: 0.2 });
  expect(req.v).toBe(1);
  expect(req.outline.length).toBeLessThanOrEqual(16);
  expect(req.outline.every(([x, y]) => x >= -0.01 && x <= 1.01 && y >= -0.01 && y <= 1.01)).toBe(true);
  expect(req.local_scores.rectangle).toBe(0.81);
  expect(JSON.stringify(req).length).toBeLessThan(900);
});
