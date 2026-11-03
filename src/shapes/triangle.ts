import type { Triangle, Vec2 } from '../core/types';
import type { Prepared } from '../recognition/prepare';
import { rmsDist, score, strokePoly } from './geometry';

const area = (a: Vec2, b: Vec2, c: Vec2) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
const map = (o: Triangle, f: (p: Vec2) => Vec2): Triangle => ({ ...o, vertices: [f(o.vertices[0]), f(o.vertices[1]), f(o.vertices[2])] });

export const triangle = {
  type: 'triangle' as const,
  closed: true,
  outline: (o: Triangle): Vec2[] => o.vertices,
  inside(o: Triangle, p: Vec2) {
    const [a, b, c] = o.vertices;
    const sign = (p1: Vec2, p2: Vec2, p3: Vec2) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    const d1 = sign(p, a, b), d2 = sign(p, b, c), d3 = sign(p, c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  },
  labelBox(o: Triangle) {
    const xs = o.vertices.map((v) => v[0]), ys = o.vertices.map((v) => v[1]);
    const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
    return { x: x + w * 0.25, y: y + h * 0.45, w: w * 0.5, h: h * 0.5 };
  },
  translate: (o: Triangle, d: Vec2) => map(o, (p) => [p[0] + d[0], p[1] + d[1]]),
  scale: (o: Triangle, a: Vec2, sx: number, sy: number) => map(o, (p) => [a[0] + (p[0] - a[0]) * sx, a[1] + (p[1] - a[1]) * sy]),
  draw: (ctx: CanvasRenderingContext2D, o: Triangle) => strokePoly(ctx, o.vertices, true),
  fit(s: Prepared) {
    // maior triângulo inscrito nos pontos do traço (64³/6 ≈ 44 mil combinações)
    const p = s.pts;
    let best = 0, bi = 0, bj = 1, bk = 2;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        for (let k = j + 1; k < p.length; k++) {
          const a = area(p[i]!, p[j]!, p[k]!);
          if (a > best) { best = a; bi = i; bj = j; bk = k; }
        }
    const v: [Vec2, Vec2, Vec2] = [p[bi]!, p[bj]!, p[bk]!];
    const err = rmsDist(p, v, true) / s.diag;
    return { confidence: score(err, 0.07) * s.closeFactor, area: best, build: () => ({ vertices: v }) };
  },
  match(s: Prepared) {
    if (!s.closed) return null;
    const f = triangle.fit(s);
    if (f.area < 0.1 * s.box.w * s.box.h) return null;
    return f;
  },
};
