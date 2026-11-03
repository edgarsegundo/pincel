import type { Box, Vec2 } from '../core/types';

export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function distToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function distToPolyline(p: Vec2, pts: Vec2[], closed: boolean) {
  let d = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) d = Math.min(d, distToSegment(p, pts[i]!, pts[(i + 1) % pts.length]!));
  return d;
}

export function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

export function nearestOnPolyline(p: Vec2, pts: Vec2[], closed: boolean): Vec2 {
  let best = pts[0]!, bd = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const q = nearestOnSegment(p, pts[i]!, pts[(i + 1) % pts.length]!);
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

export function bboxOf(pts: Vec2[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function polylineLength(pts: Vec2[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1]!, pts[i]!);
  return l;
}

/** n pontos equidistantes ao longo da polilinha, incluindo as duas pontas. */
export function resample(pts: Vec2[], n: number): Vec2[] {
  const total = polylineLength(pts);
  if (total === 0 || pts.length < 2) return Array.from({ length: n }, () => pts[0] ?? [0, 0]);
  const step = total / (n - 1);
  const out: Vec2[] = [pts[0]!];
  let acc = 0;
  let prev = pts[0]!;
  let i = 1;
  while (out.length < n - 1 && i < pts.length) {
    const cur = pts[i]!;
    const seg = dist(prev, cur);
    if (acc + seg >= step && seg > 0) {
      const t = (step - acc) / seg;
      const p: Vec2 = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
      out.push(p);
      prev = p;
      acc = 0;
    } else {
      acc += seg;
      prev = cur;
      i++;
    }
  }
  while (out.length < n) out.push(pts[pts.length - 1]!);
  return out;
}

export function signedArea(pts: Vec2[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function scaleBox(b: Box, a: Vec2, sx: number, sy: number): Box {
  const x0 = a[0] + (b.x - a[0]) * sx, x1 = a[0] + (b.x + b.w - a[0]) * sx;
  const y0 = a[1] + (b.y - a[1]) * sy, y1 = a[1] + (b.y + b.h - a[1]) * sy;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export const rectOutline = (b: Box): Vec2[] => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
export const diamondOutline = (b: Box): Vec2[] => [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]];

export function rmsDist(pts: Vec2[], poly: Vec2[], closed: boolean) {
  let s = 0;
  for (const p of pts) { const d = distToPolyline(p, poly, closed); s += d * d; }
  return Math.sqrt(s / pts.length);
}

/** Converte um erro relativo em confiança 0..1 (queda quadrática: erros pequenos custam pouco). */
export const score = (err: number, tol: number) => Math.max(0, 1 - (err / tol) ** 2);

export function strokePoly(ctx: CanvasRenderingContext2D, pts: Vec2[], closed: boolean) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
  ctx.stroke();
}
