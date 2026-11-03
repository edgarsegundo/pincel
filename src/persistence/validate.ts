import type { WhiteboardObject } from '../core/types';
import { registry } from '../shapes';

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const vec = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(num);
const COLORS = new Set(['ink', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'violet']);
const FILLS = new Set(['none', 'solid', 'hachure']);

/** Campos obrigatórios por tipo. Um objeto malformado derrubaria o render, então é descartado. */
const geometry: Record<string, (o: any) => boolean> = {
  freehand: (o) => Array.isArray(o.points) && o.points.length >= 3 && o.points.length % 3 === 0 && o.points.every(num),
  text: (o) => num(o.x) && num(o.y) && typeof o.text === 'string',
  line: (o) => vec(o.from) && vec(o.to) && ['none', 'end', 'both'].includes(o.arrowhead),
  rectangle: (o) => [o.x, o.y, o.w, o.h].every(num),
  diamond: (o) => [o.x, o.y, o.w, o.h].every(num),
  ellipse: (o) => [o.cx, o.cy, o.rx, o.ry].every(num) && o.rx > 0 && o.ry > 0,
  triangle: (o) => Array.isArray(o.vertices) && o.vertices.length === 3 && o.vertices.every(vec),
};

export function isValidObject(o: any): o is WhiteboardObject {
  return !!o && typeof o.id === 'string' && !!registry[o.type] && !!geometry[o.type]?.(o) &&
    COLORS.has(o.color) && ['s', 'm', 'l'].includes(o.size) && num(o.seed) && num(o.createdAt);
}

/**
 * Campos opcionais malformados (rótulo, preenchimento, ligações, origem da conversão) não
 * justificam perder o objeto: são removidos e o resto é mantido.
 */
function cleanOptional(o: any): WhiteboardObject {
  const out = { ...o };
  if (out.label !== undefined && !(out.label && typeof out.label.text === 'string')) delete out.label;
  if (out.fill !== undefined && !FILLS.has(out.fill)) delete out.fill;
  if (out.recognizedFrom !== undefined) {
    const r = out.recognizedFrom;
    if (!(r && Array.isArray(r.stroke) && r.stroke.every(num) && num(r.at) && num(r.confidence))) delete out.recognizedFrom;
  }
  if (out.bindings !== undefined) {
    const b: Record<string, unknown> = {};
    for (const side of ['from', 'to']) {
      const x = out.bindings?.[side];
      if (x && typeof x.objectId === 'string' && vec(x.anchor)) b[side] = { objectId: x.objectId, anchor: x.anchor };
    }
    if (out.type === 'line' && (b.from || b.to)) out.bindings = b;
    else delete out.bindings;
  }
  return out;
}

/** Descarta objetos inválidos e ids repetidos (mantém o primeiro). */
export function sanitizeObjects(raw: unknown): WhiteboardObject[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WhiteboardObject[] = [];
  for (const o of raw) {
    if (!isValidObject(o) || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push(cleanOptional(o));
  }
  return out;
}

export function parseBoard(text: string) {
  try {
    const d = JSON.parse(text);
    if (d?.version !== 1 || !Array.isArray(d.objects)) return null;
    const v = d.viewport;
    const viewport = v && num(v.x) && num(v.y) && num(v.zoom) && v.zoom > 0 ? { x: v.x, y: v.y, zoom: v.zoom } : { x: 0, y: 0, zoom: 1 };
    return { objects: sanitizeObjects(d.objects), viewport };
  } catch {
    return null;
  }
}
