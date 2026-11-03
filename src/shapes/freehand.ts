import { STROKE_PX, type Box, type Freehand, type Vec2 } from '../core/types';

function distToSegment(p: Vec2, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
}

export const freehand = {
  type: 'freehand' as const,
  bounds(o: Freehand): Box {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < o.points.length; i += 3) {
      x0 = Math.min(x0, o.points[i]!); x1 = Math.max(x1, o.points[i]!);
      y0 = Math.min(y0, o.points[i + 1]!); y1 = Math.max(y1, o.points[i + 1]!);
    }
    const pad = STROKE_PX[o.size];
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  },
  hitTest(o: Freehand, p: Vec2, tolerance: number) {
    const r = STROKE_PX[o.size] + tolerance;
    const pts = o.points;
    if (pts.length === 3) return Math.hypot(p[0] - pts[0]!, p[1] - pts[1]!) <= r;
    for (let i = 0; i + 5 < pts.length; i += 3) {
      if (distToSegment(p, pts[i]!, pts[i + 1]!, pts[i + 3]!, pts[i + 4]!) <= r) return true;
    }
    return false;
  },
  translate(o: Freehand, d: Vec2): Freehand {
    const points = o.points.slice();
    for (let i = 0; i < points.length; i += 3) { points[i]! += d[0]; points[i + 1]! += d[1]; }
    return { ...o, points };
  },
};
