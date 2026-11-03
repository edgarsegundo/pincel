import type { Line, Vec2 } from '../core/types';
import { dist, score } from './geometry';
import type { Prepared } from '../recognition/prepare';

export const line = {
  type: 'line' as const,
  closed: false,
  outline: (o: Line): Vec2[] => [o.from, o.to],
  translate: (o: Line, d: Vec2): Line => ({ ...o, from: [o.from[0] + d[0], o.from[1] + d[1]], to: [o.to[0] + d[0], o.to[1] + d[1]] }),
  scale: (o: Line, a: Vec2, sx: number, sy: number): Line => ({
    ...o,
    from: [a[0] + (o.from[0] - a[0]) * sx, a[1] + (o.from[1] - a[1]) * sy],
    to: [a[0] + (o.to[0] - a[0]) * sx, a[1] + (o.to[1] - a[1]) * sy],
  }),
  draw(ctx: CanvasRenderingContext2D, o: Line) {
    ctx.beginPath();
    ctx.moveTo(...o.from);
    ctx.lineTo(...o.to);
    const head = (tip: Vec2, tail: Vec2) => {
      const ang = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
      const len = Math.max(10, ctx.lineWidth * 4);
      for (const s of [-1, 1]) ctx.moveTo(tip[0], tip[1]), ctx.lineTo(tip[0] - len * Math.cos(ang + s * 0.45), tip[1] - len * Math.sin(ang + s * 0.45));
    };
    if (o.arrowhead !== 'none') head(o.to, o.from);
    if (o.arrowhead === 'both') head(o.from, o.to);
    ctx.stroke();
  },
  match(s: Prepared) {
    if (s.closed) return null;
    const a = s.pts[0]!, b = s.pts[s.pts.length - 1]!;
    const chord = dist(a, b);
    if (chord < 1e-6 || chord / s.length < 0.88) return null;
    // desvio rms em relação à reta que passa pelas pontas
    const nx = -(b[1] - a[1]) / chord, ny = (b[0] - a[0]) / chord;
    let sum = 0;
    for (const p of s.pts) { const d = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny; sum += d * d; }
    const err = Math.sqrt(sum / s.pts.length) / chord;
    return { confidence: score(err, 0.06), build: () => ({ from: a, to: b, arrowhead: 'none' }) };
  },
};
