import type { Box, Line, Shape, Triangle, Vec2, WhiteboardObject } from '../core/types';
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

/**
 * Triângulo com um ângulo reto (e catetos mais ou menos alinhados aos eixos) fica retângulo de
 * verdade: catetos horizontal e vertical, canto do ângulo reto no mesmo quadrante do desenho.
 */
const rightTriangle = (s: Triangle, v: Triangle['vertices']): Triangle | null => {
  const tol = Math.sin((config.beautify.rightAngleDeg * Math.PI) / 180);
  for (let i = 0; i < 3; i++) {
    const r = v[i]!, a = v[(i + 1) % 3]!, c = v[(i + 2) % 3]!;
    const u: Vec2 = [a[0] - r[0], a[1] - r[1]], w: Vec2 = [c[0] - r[0], c[1] - r[1]];
    const lu = Math.hypot(u[0], u[1]), lw = Math.hypot(w[0], w[1]);
    if (lu < 1e-6 || lw < 1e-6 || Math.abs(u[0] * w[0] + u[1] * w[1]) / (lu * lw) > tol) continue;
    // u na horizontal e w na vertical, ou o contrário: vale o que menos gira
    const uh = Math.abs(u[0]) + Math.abs(w[1]), uv = Math.abs(u[1]) + Math.abs(w[0]);
    if (Math.max(uh, uv) / (lu + lw) < config.beautify.rightAxisMin) continue;
    const [hx, hy, lx, ly] = uh >= uv ? [u[0], w[1], lu, lw] : [w[0], u[1], lw, lu];
    const sx = Math.sign(hx) || 1, sy = Math.sign(hy) || 1;
    const [cx, cy] = center(geomBox(s));
    const o: Vec2 = [cx - (sx * lx) / 2, cy - (sy * ly) / 2];
    return { ...s, vertices: [o, [o[0] + sx * lx, o[1]], [o[0], o[1] + sy * ly]] };
  }
  return null;
};

/**
 * Triângulo torto vira isósceles com a base alinhada a um eixo (ponta para cima, baixo, esquerda
 * ou direita, a mais próxima da desenhada) e equilátero se já estava perto disso. Mantém centro,
 * base e altura aproximados do desenho.
 */
const idealTriangle = (s: Shape): Shape => {
  if (s.type !== 'triangle') return s;
  const v = s.vertices;
  const d = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const right = rightTriangle(s, v);
  if (right) return right;
  // a ponta é o vértice cujos dois lados são mais parecidos; na dúvida, prefere ponta vertical
  const mean = (d(v[0], v[1]) + d(v[1], v[2]) + d(v[2], v[0])) / 3;
  let apex = 0, best = Infinity;
  for (let i = 0; i < 3; i++) {
    const q = v[i]!, a = v[(i + 1) % 3]!, c = v[(i + 2) % 3]!;
    const toApex: Vec2 = [q[0] - (a[0] + c[0]) / 2, q[1] - (a[1] + c[1]) / 2];
    const sideways = Math.abs(toApex[0]) / (Math.hypot(toApex[0], toApex[1]) || 1);
    const cost = Math.abs(d(q, a) - d(q, c)) / mean + config.beautify.verticalBias * sideways;
    if (cost < best) { best = cost; apex = i; }
  }
  const p = v[apex]!, a = v[(apex + 1) % 3]!, c = v[(apex + 2) % 3]!;
  const base = d(a, c);
  if (base < 1e-6) return s;
  const mid: Vec2 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const height = Math.abs((c[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (c[1] - a[1])) / base;
  const h = Math.abs(height / base - Math.sqrt(3) / 2) <= (Math.sqrt(3) / 2) * config.beautify.equilateralTol ? (base * Math.sqrt(3)) / 2 : height;
  const dx = p[0] - mid[0], dy = p[1] - mid[1];
  const dir: Vec2 = Math.abs(dy) >= Math.abs(dx) ? [0, Math.sign(dy) || -1] : [Math.sign(dx), 0];
  const perp: Vec2 = [-dir[1], dir[0]];
  const bb = geomBox(s);
  const [cx, cy] = center(bb);
  const baseMid: Vec2 = [cx - (dir[0] * h) / 2, cy - (dir[1] * h) / 2];
  return {
    ...s,
    vertices: [
      [cx + (dir[0] * h) / 2, cy + (dir[1] * h) / 2],
      [baseMid[0] + (perp[0] * base) / 2, baseMid[1] + (perp[1] * base) / 2],
      [baseMid[0] - (perp[0] * base) / 2, baseMid[1] - (perp[1] * base) / 2],
    ],
  };
};

/** Retângulo/losango/elipse quase quadrados viram quadrado/círculo (com folga maior nas formas perfeitas). */
const snapProportion = (s: Shape): Shape => {
  if (s.type === 'line' || s.type === 'triangle') return s;
  const b = geomBox(s);
  const r = b.w / b.h;
  const k = settings.getState().idealShapes ? config.beautify.idealSquareRatio : config.beautify.squareRatio;
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
  if (on.idealShapes) s = idealTriangle(s);
  if (on.snapProportion || on.idealShapes) s = snapProportion(s);
  if (on.snapAngle) s = snapLine(s);
  const near = neighbors(s, ctx.others, ctx.zoom);
  if (on.snapSize) s = matchSize(s, near, ctx);
  if (on.snapAlign) s = align(s, near, ctx);
  if (s.type === 'line') s = connectLine(s, ctx.others, ctx.zoom);
  return s;
}
