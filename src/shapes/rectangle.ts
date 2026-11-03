import type { Diamond, Rectangle, Vec2 } from '../core/types';
import type { Prepared } from '../recognition/prepare';
import { diamondOutline, rectOutline, rmsDist, scaleBox, score, strokePoly } from './geometry';

type B = { x: number; y: number; w: number; h: number };

function boxShape<T extends Rectangle | Diamond>(type: T['type'], outline: (b: B) => Vec2[], perimeter: (w: number, h: number) => number, tol: number, inside: (b: B, p: Vec2) => boolean, labelBox: (b: B) => B) {
  return {
    type,
    closed: true,
    outline: (o: T) => outline(o),
    inside: (o: T, p: Vec2) => inside(o, p),
    labelBox: (o: T) => labelBox(o),
    translate: (o: T, d: Vec2): T => ({ ...o, x: o.x + d[0], y: o.y + d[1] }),
    scale: (o: T, a: Vec2, sx: number, sy: number): T => ({ ...o, ...scaleBox(o, a, sx, sy) }),
    draw: (ctx: CanvasRenderingContext2D, o: T) => strokePoly(ctx, outline(o), true),
    /** Ajuste forçado: nota do encaixe neste tipo, sem exigir fechamento nem proporção (usado com a decisão da IA). */
    fit(s: Prepared) {
      const b = s.box;
      const err = rmsDist(s.pts, outline(b), true) / s.diag;
      return { confidence: score(err, tol) * s.closeFactor, build: () => ({ x: b.x, y: b.y, w: b.w, h: b.h }) };
    },
    match(s: Prepared) {
      const b = s.box;
      if (!s.closed || Math.min(b.w, b.h) < 0.1 * Math.max(b.w, b.h)) return null;
      const ratio = s.length / perimeter(b.w, b.h);
      if (ratio < 0.75 || ratio > 1.35) return null;
      return this.fit(s);
    },
  };
}

export const rectangle = boxShape<Rectangle>('rectangle', rectOutline, (w, h) => 2 * (w + h), 0.07,
  (b, p) => p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h,
  (b) => ({ x: b.x + b.w * 0.06, y: b.y + b.h * 0.06, w: b.w * 0.88, h: b.h * 0.88 }));
export const diamond = boxShape<Diamond>('diamond', diamondOutline, (w, h) => 2 * Math.hypot(w, h), 0.07,
  (b, p) => Math.abs(p[0] - b.x - b.w / 2) / (b.w / 2) + Math.abs(p[1] - b.y - b.h / 2) / (b.h / 2) <= 1,
  (b) => ({ x: b.x + b.w / 4, y: b.y + b.h / 4, w: b.w / 2, h: b.h / 2 }));
