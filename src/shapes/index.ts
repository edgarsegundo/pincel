import { STROKE_PX, type Box, type Vec2, type WhiteboardObject } from '../core/types';
import type { Prepared } from '../recognition/prepare';
import { ellipse } from './ellipse';
import { freehand } from './freehand';
import { bboxOf, distToPolyline } from './geometry';
import { line } from './line';
import { diamond, rectangle } from './rectangle';
import { text } from './text';
import { triangle } from './triangle';

export interface Match { confidence: number; build(): Record<string, unknown> }

/** Registro de formas: nova forma = um arquivo em shapes/ + uma linha aqui. */
export interface ShapeDef {
  type: string;
  translate(o: any, d: Vec2): any;
  bounds?(o: any): Box;
  hitTest?(o: any, p: Vec2, tolerance: number): boolean;
  outline?(o: any): Vec2[]; // contorno (geometria real, usada em hit-test, alinhamento e animação)
  closed?: boolean;
  inside?(o: any, p: Vec2): boolean; // ponto dentro de uma forma fechada
  labelBox?(o: any): Box; // área do rótulo
  draw?(ctx: CanvasRenderingContext2D, o: any): void;
  scale?(o: any, anchor: Vec2, sx: number, sy: number): any;
  match?(s: Prepared): Match | null; // reconhecimento a partir de um traço (com todas as proteções)
  fit?(s: Prepared): Match; // encaixe forçado neste tipo, sem proteções (usado com a decisão da IA)
}

const defs: ShapeDef[] = [freehand, text, line, rectangle, diamond, ellipse, triangle];
export const registry: Record<string, ShapeDef> = Object.fromEntries(defs.map((d) => [d.type, d]));
export const matchers = defs.filter((d) => d.match);

const def = (o: WhiteboardObject) => registry[o.type]!;
const pad = (o: WhiteboardObject) => STROKE_PX[o.size] / 2 + 1;

/** Caixa geométrica, sem a espessura do traço. */
export function geomBox(o: WhiteboardObject): Box {
  const d = def(o);
  return d.outline ? bboxOf(d.outline(o)) : d.bounds!(o);
}

// Objetos são imutáveis, então o cache é seguro. Medidas de texto dependem da fonte carregada:
// trocar o cache (invalidateBounds) descarta todas as caixas antigas de uma vez.
let boundsCache = new WeakMap<WhiteboardObject, Box>();
export const invalidateBounds = () => { boundsCache = new WeakMap(); };

export function bounds(o: WhiteboardObject): Box {
  let c = boundsCache.get(o);
  if (c) return c;
  const d = def(o);
  if (d.bounds) c = d.bounds(o);
  else {
    const b = geomBox(o), p = pad(o);
    c = { x: b.x - p, y: b.y - p, w: b.w + p * 2, h: b.h + p * 2 };
  }
  boundsCache.set(o, c);
  return c;
}

export function hitTest(o: WhiteboardObject, p: Vec2, tol: number) {
  const d = def(o);
  return d.hitTest ? d.hitTest(o, p, tol) : distToPolyline(p, d.outline!(o), !!d.closed) <= pad(o) + tol;
}

export const translate = (o: WhiteboardObject, d: Vec2): WhiteboardObject => def(o).translate(o, d);

export function outlineOf(o: WhiteboardObject): Vec2[] | undefined {
  return def(o).outline?.(o);
}

export function drawShape(ctx: CanvasRenderingContext2D, o: WhiteboardObject) {
  def(o).draw?.(ctx, o);
}

export function scaleObject<T extends WhiteboardObject>(o: T, anchor: Vec2, sx: number, sy: number): T {
  return (def(o).scale?.(o, anchor, sx, sy) ?? o) as T;
}

function inBounds(o: WhiteboardObject, p: Vec2, tol: number) {
  const b = bounds(o);
  return p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
}

/** Objeto mais ao topo sob o ponto. */
export function pickAt(objects: WhiteboardObject[], p: Vec2, tol: number): WhiteboardObject | undefined {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]!;
    if (inBounds(o, p, tol) && hitTest(o, p, tol)) return o;
  }
}

/** Todos os objetos sob o ponto (usado pelo rabisco de apagar). */
export function pickAll(objects: WhiteboardObject[], p: Vec2, tol: number): WhiteboardObject[] {
  return objects.filter((o) => inBounds(o, p, tol) && hitTest(o, p, tol));
}

/** Forma fechada que aceita rótulo? */
export const canLabel = (o: WhiteboardObject) => !!def(o).labelBox;
export const labelBoxOf = (o: WhiteboardObject): Box => def(o).labelBox!(o);

/** Menor forma fechada que contém o ponto (para rótulos). */
export function closedContaining(objects: WhiteboardObject[], p: Vec2): WhiteboardObject | undefined {
  let best: WhiteboardObject | undefined, bestArea = Infinity;
  for (const o of objects) {
    const d = def(o);
    if (!d.inside || !d.inside(o, p)) continue;
    const b = geomBox(o), a = b.w * b.h;
    if (a < bestArea) { best = o; bestArea = a; }
  }
  return best;
}
