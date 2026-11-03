import { store } from '../core/store';
import type { Freehand, Shape, Vec2 } from '../core/types';
import { outlineOf, registry } from '../shapes';
import { resample, signedArea, dist } from '../shapes/geometry';
import { beautify, type BeautifyCtx } from './beautify';
import { recognize, type Trigger } from './decide';
import { prepare, toVecs } from './prepare';

function makeShape(stroke: Freehand, type: string, geometry: Record<string, unknown>, from: { source: 'local' | 'ai'; confidence: number; trigger: Trigger }, ctx: BeautifyCtx): Shape {
  const { id, color, size, seed, createdAt } = stroke;
  const shape = {
    id, color, size, seed, createdAt, type, ...geometry,
    recognizedFrom: { stroke: stroke.points, ...from, at: Date.now() },
  } as Shape;
  if (registry[type]!.closed) (shape as { fill?: string }).fill = store.getState().fill;
  return beautify(shape, ctx);
}

/** Tenta transformar um traço livre em forma. Mantém o mesmo id (desfazer restaura o traço). */
export function convertStroke(stroke: Freehand, trigger: Trigger, ctx: BeautifyCtx): Shape | null {
  const r = recognize(stroke.points, trigger);
  return r ? makeShape(stroke, r.type, r.geometry, { source: 'local', confidence: r.confidence, trigger }, ctx) : null;
}

/**
 * Converte para um tipo JÁ decidido (pela IA), calculando a geometria localmente. Recusa se o
 * encaixe local nesse tipo for pior que `minFit`: a IA não consegue forçar uma forma absurda.
 */
export function convertAs(stroke: Freehand, type: string, from: { source: 'local' | 'ai'; confidence: number }, ctx: BeautifyCtx, minFit: number, trigger: Trigger = 'release'): Shape | null {
  const prepared = prepare(stroke.points);
  const fit = prepared && registry[type]?.fit?.(prepared);
  if (!fit || fit.confidence < minFit) return null;
  return makeShape(stroke, type, fit.build(), { ...from, trigger }, ctx);
}

/** Pontos de partida e chegada (65 cada) para a animação traço → forma. */
export function morphPoints(strokePoints: number[], shape: Shape): { from: Vec2[]; to: Vec2[] } {
  const from = resample(toVecs(strokePoints), 65);
  const outline = outlineOf(shape)!;
  if (!registry[shape.type]!.closed) {
    const to = resample(outline, 65);
    return { from, to: dist(from[0]!, to[64]!) < dist(from[0]!, to[0]!) ? to.reverse() : to };
  }
  let dense = resample([...outline, outline[0]!], 257).slice(0, 256);
  let start = 0;
  for (let i = 1; i < dense.length; i++) if (dist(dense[i]!, from[0]!) < dist(dense[start]!, from[0]!)) start = i;
  dense = [...dense.slice(start), ...dense.slice(0, start)];
  if (signedArea(from) * signedArea(dense) < 0) dense = [dense[0]!, ...dense.slice(1).reverse()];
  return { from, to: resample([...dense, dense[0]!], 65) };
}
