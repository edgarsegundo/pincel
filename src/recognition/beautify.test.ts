import { expect, test, vi } from 'vitest';
import type { Ellipse, Triangle } from '../core/types';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { beautify } = await import('./beautify');
const { settings } = await import('../settings/settings');

const base = { id: 't', color: 'ink', size: 'm', seed: 1, createdAt: 0 } as const;
const ctx = { others: [], zoom: 1 };
const tri = (vertices: Triangle['vertices']) => ({ ...base, type: 'triangle', vertices } as unknown as Triangle);
const set = (idealShapes: boolean) => settings.setState({ idealShapes, snapSize: false, snapAlign: false });

test('desligado: o triângulo segue exatamente o desenho', () => {
  set(false);
  const t = tri([[10, 80], [95, 20], [120, 90]]);
  expect(beautify(t, ctx)).toEqual(t);
});

test('ligado: triângulo torto vira isósceles com a base horizontal e a ponta para cima', () => {
  set(true);
  const out = beautify(tri([[10, 80], [60, 15], [118, 92]]), ctx) as Triangle;
  const [apex, l, r] = out.vertices;
  expect(l[1]).toBeCloseTo(r[1]);
  expect(apex[1]).toBeLessThan(l[1]);
  expect(apex[0]).toBeCloseTo((l[0] + r[0]) / 2);
});

test('ligado: triângulo de ponta para baixo continua para baixo', () => {
  set(true);
  const [apex, l, r] = (beautify(tri([[10, 10], [120, 14], [62, 100]]), ctx) as Triangle).vertices;
  expect(l[1]).toBeCloseTo(r[1]);
  expect(apex[1]).toBeGreaterThan(l[1]);
});

test('ligado: perto de equilátero fica equilátero', () => {
  set(true);
  const [a, b, c] = (beautify(tri([[0, 90], [50, 5], [104, 92]]), ctx) as Triangle).vertices;
  const d = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!);
  expect(d(a, b)).toBeCloseTo(d(b, c));
  expect(d(a, c)).toBeCloseTo(d(b, c));
});

test('ligado: elipse quase redonda (até 20%) vira círculo', () => {
  set(true);
  const e = { ...base, type: 'ellipse', cx: 50, cy: 50, rx: 55, ry: 47 } as unknown as Ellipse;
  const out = beautify(e, ctx) as Ellipse;
  expect(out.rx).toBeCloseTo(out.ry);
});

test('ligado: triângulo retângulo continua retângulo, com catetos nos eixos', () => {
  set(true);
  const out = beautify(tri([[2, 52], [103, 47], [-1, 3]]), ctx) as Triangle;
  const xs = out.vertices.map((p) => p[0]), ys = out.vertices.map((p) => p[1]);
  // dois vértices em cada x e em cada y: catetos horizontal e vertical
  expect(new Set(xs.map((x) => x.toFixed(3))).size).toBe(2);
  expect(new Set(ys.map((y) => y.toFixed(3))).size).toBe(2);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(90);
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(60);
});

test('ligado: ângulo reto na ponta com catetos na diagonal segue como isósceles em pé', () => {
  set(true);
  const [apex, l, r] = (beautify(tri([[0, 50], [50, 0], [100, 50]]), ctx) as Triangle).vertices;
  expect(l[1]).toBeCloseTo(r[1]);
  expect(apex[1]).toBeLessThan(l[1]);
});
