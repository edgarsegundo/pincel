import type { Ellipse, Vec2 } from '../core/types';
import type { Prepared } from '../recognition/prepare';
import { scaleBox, score } from './geometry';

const outline = (o: Ellipse): Vec2[] =>
  Array.from({ length: 72 }, (_, i) => {
    const t = (i / 72) * Math.PI * 2;
    return [o.cx + o.rx * Math.cos(t), o.cy + o.ry * Math.sin(t)] as Vec2;
  });

export const ellipse = {
  type: 'ellipse' as const,
  closed: true,
  outline,
  inside: (o: Ellipse, p: Vec2) => ((p[0] - o.cx) / o.rx) ** 2 + ((p[1] - o.cy) / o.ry) ** 2 <= 1,
  labelBox: (o: Ellipse) => ({ x: o.cx - o.rx * 0.7071, y: o.cy - o.ry * 0.7071, w: o.rx * 1.4142, h: o.ry * 1.4142 }),
  translate: (o: Ellipse, d: Vec2): Ellipse => ({ ...o, cx: o.cx + d[0], cy: o.cy + d[1] }),
  scale(o: Ellipse, a: Vec2, sx: number, sy: number): Ellipse {
    const b = scaleBox({ x: o.cx - o.rx, y: o.cy - o.ry, w: o.rx * 2, h: o.ry * 2 }, a, sx, sy);
    return { ...o, cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 };
  },
  draw(ctx: CanvasRenderingContext2D, o: Ellipse) {
    ctx.beginPath();
    ctx.ellipse(o.cx, o.cy, Math.max(o.rx, 0.1), Math.max(o.ry, 0.1), 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  fit(s: Prepared) {
    const b = s.box;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = Math.max(b.w / 2, 1e-6), ry = Math.max(b.h / 2, 1e-6);
    let sum = 0;
    for (const [x, y] of s.pts) {
      const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
      sum += (r - 1) ** 2;
    }
    const err = Math.sqrt(sum / s.pts.length);
    return { confidence: score(err, 0.16) * s.closeFactor, build: () => ({ cx, cy, rx, ry }) };
  },
  match(s: Prepared) {
    const b = s.box;
    if (!s.closed || Math.min(b.w, b.h) < 0.1 * Math.max(b.w, b.h)) return null;
    const rx = b.w / 2, ry = b.h / 2;
    // perímetro de Ramanujan como checagem de sanidade
    const h = ((rx - ry) / (rx + ry)) ** 2;
    const per = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    const ratio = s.length / per;
    if (ratio < 0.8 || ratio > 1.25) return null;
    return ellipse.fit(s);
  },
};
