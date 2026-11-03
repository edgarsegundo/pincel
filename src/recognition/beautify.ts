import type { Box, Line, Shape, Vec2, WhiteboardObject } from '../core/types';
import { geomBox, scaleObject, translate } from '../shapes';
import { connectLine } from '../core/bindings';
import { settings } from '../settings/settings';
import { config } from './config';

export interface BeautifyCtx { others: WhiteboardObject[]; zoom: number }
type Step = (s: Shape, near: Shape[], ctx: BeautifyCtx) => Shape;

const center = (b: Box): Vec2 => [b.x + b.w / 2, b.y + b.h / 2];

/** Linha: ângulo próximo de múltiplos de 45° gruda neles. */
const snapLine = (s: Shape): Shape => {
  if (s.type !== 'line') return s;
  const { from, to } = s;
  const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  if (Math.abs(ang - snapped) > (config.beautify.angleDeg * Math.PI) / 180) return s;
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return { ...s, to: [from[0] + len * Math.cos(snapped), from[1] + len * Math.sin(snapped)] } as Line;
};

/** Retângulo/losango/elipse quase quadrados viram quadrado/círculo. */
const snapProportion = (s: Shape): Shape => {
  if (s.type === 'line' || s.type === 'triangle') return s;
  const b = geomBox(s);
  const r = b.w / b.h;
  const k = config.beautify.squareRatio;
  if (r < 1 - k || r > 1 + k) return s;
  const avg = (b.w + b.h) / 2;
  return scaleObject(s, center(b), avg / b.w, avg / b.h);
};

/** Largura/altura a menos de 6% de uma vizinha do mesmo tipo ficam iguais. */
const matchSize: Step = (s, near) => {
  if (s.type === 'line') return s;
  const b = geomBox(s);
  const tol = config.beautify.sizeMatch;
  let sx = 1, sy = 1;
  let bestX = Infinity, bestY = Infinity;
  for (const n of near) {
    if (n.type !== s.type) continue;
    const nb = geomBox(n);
    const dx = Math.abs(b.w - nb.w) / nb.w, dy = Math.abs(b.h - nb.h) / nb.h;
    if (dx < tol && dx < bestX) { bestX = dx; sx = nb.w / b.w; }
    if (dy < tol && dy < bestY) { bestY = dy; sy = nb.h / b.h; }
  }
  return sx === 1 && sy === 1 ? s : scaleObject(s, center(b), sx, sy);
};

/** Bordas e centros a menos de 8 px (de tela) de uma vizinha se alinham a ela. */
const align: Step = (s, near, { zoom }) => {
  const tol = config.beautify.alignPx / zoom;
  const lines = (b: Box) => ({ xs: [b.x, b.x + b.w / 2, b.x + b.w], ys: [b.y, b.y + b.h / 2, b.y + b.h] });
  const mine = lines(geomBox(s));
  let dx = 0, dy = 0, bx = tol + 1e-9, by = tol + 1e-9;
  for (const n of near) {
    const theirs = lines(geomBox(n));
    for (const a of mine.xs) for (const t of theirs.xs) if (Math.abs(t - a) < bx && Math.abs(t - a) > 1e-9) { bx = Math.abs(t - a); dx = t - a; }
    for (const a of mine.ys) for (const t of theirs.ys) if (Math.abs(t - a) < by && Math.abs(t - a) > 1e-9) { by = Math.abs(t - a); dy = t - a; }
  }
  return dx || dy ? (translate(s, [dx, dy]) as Shape) : s;
};

function neighbors(s: Shape, others: WhiteboardObject[], zoom: number): Shape[] {
  const b = geomBox(s);
  const reach = config.beautify.neighborPx / zoom;
  return others.filter((o): o is Shape => {
    if (o.id === s.id || o.type === 'freehand' || o.type === 'text') return false;
    const ob = geomBox(o);
    return ob.x < b.x + b.w + reach && ob.x + ob.w > b.x - reach && ob.y < b.y + b.h + reach && ob.y + ob.h > b.y - reach;
  });
}

export function beautify(shape: Shape, ctx: BeautifyCtx): Shape {
  const on = settings.getState();
  let s = shape;
  if (on.snapProportion) s = snapProportion(s);
  if (on.snapAngle) s = snapLine(s);
  const near = neighbors(s, ctx.others, ctx.zoom);
  if (on.snapSize) s = matchSize(s, near, ctx);
  if (on.snapAlign) s = align(s, near, ctx);
  if (s.type === 'line') s = connectLine(s, ctx.others, ctx.zoom);
  return s;
}
