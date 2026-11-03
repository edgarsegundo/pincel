import type { Shape, Vec2, WhiteboardObject } from '../core/types';
import { geomBox, outlineOf } from '../shapes';

/** Dicas visuais após uma conversão: guias de alinhamento e pontos de conexão. */
export function cueFor(shape: Shape, others: WhiteboardObject[]) {
  const lines: number[][] = [];
  const dots: Vec2[] = [];
  const outlines: Vec2[][] = [];
  const a = geomBox(shape);
  const ax = [a.x, a.x + a.w / 2, a.x + a.w], ay = [a.y, a.y + a.h / 2, a.y + a.h];
  for (const n of others) {
    if (n.id === shape.id || n.type === 'freehand' || n.type === 'text') continue;
    const b = geomBox(n);
    const bx = [b.x, b.x + b.w / 2, b.x + b.w], by = [b.y, b.y + b.h / 2, b.y + b.h];
    const eps = 1e-6;
    for (let i = 0; i < 3 && lines.length < 6; i++) {
      if (Math.abs(ax[i]! - bx[i]!) < eps && shape.type !== 'line') lines.push([ax[i]!, Math.min(a.y, b.y), ax[i]!, Math.max(a.y + a.h, b.y + b.h)]);
      if (Math.abs(ay[i]! - by[i]!) < eps && shape.type !== 'line') lines.push([Math.min(a.x, b.x), ay[i]!, Math.max(a.x + a.w, b.x + b.w), ay[i]!]);
    }
  }
  if (shape.type === 'line' && shape.bindings) {
    for (const side of ['from', 'to'] as const) {
      const b = shape.bindings[side];
      const target = b && others.find((o) => o.id === b.objectId);
      if (!target) continue;
      dots.push(shape[side]);
      const out = outlineOf(target);
      if (out) outlines.push(out);
    }
  }
  return { lines, dots, outlines };
}
