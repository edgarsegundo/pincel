import { geomBox, outlineOf, registry } from '../shapes';
import { dist, nearestOnPolyline } from '../shapes/geometry';
import { settings } from '../settings/settings';
import type { Binding, Line, Vec2, WhiteboardObject } from './types';

const CONNECT_PX = 12;
type Side = 'from' | 'to';

const isClosedShape = (o: WhiteboardObject) => !!registry[o.type]?.closed && !!registry[o.type]?.outline;

/** Ponto do contorno da forma que corresponde à âncora normalizada. */
function anchorPoint(target: WhiteboardObject, anchor: Vec2): Vec2 {
  const b = geomBox(target);
  return nearestOnPolyline([b.x + anchor[0] * b.w, b.y + anchor[1] * b.h], outlineOf(target)!, true);
}

/** Pontas de uma linha perto do contorno de uma forma fechada se ligam a ela (e grudam no contorno). */
export function connectLine(line: Line, others: WhiteboardObject[], zoom: number): Line {
  if (!settings.getState().connectors) return line;
  const reach = CONNECT_PX / zoom;
  const next: Line = { ...line };
  const bindings: NonNullable<Line['bindings']> = {};
  const taken = new Set<string>();
  for (const side of ['from', 'to'] as Side[]) {
    const p = line[side];
    let best: WhiteboardObject | undefined, bd = reach, bq: Vec2 = p;
    for (const o of others) {
      if (o.id === line.id || taken.has(o.id) || !isClosedShape(o)) continue;
      const q = nearestOnPolyline(p, outlineOf(o)!, true);
      const d = dist(p, q);
      if (d <= bd) { best = o; bd = d; bq = q; }
    }
    if (!best) continue;
    const b = geomBox(best);
    bindings[side] = { objectId: best.id, anchor: [(bq[0] - b.x) / (b.w || 1), (bq[1] - b.y) / (b.h || 1)] } satisfies Binding;
    next[side] = bq;
    taken.add(best.id);
  }
  if (bindings.from || bindings.to) next.bindings = bindings;
  return next;
}

/**
 * Depois de mover objetos: linhas ligadas a formas movidas acompanham; uma linha arrastada
 * sozinha (sem a forma) se solta; ligações a formas que não existem mais são removidas.
 */
export function reconnect(objects: WhiteboardObject[], moved: Set<string>): WhiteboardObject[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  let changed = false;
  const out = objects.map((o) => {
    if (o.type !== 'line' || !o.bindings) return o;
    let line: Line = o;
    for (const side of ['from', 'to'] as Side[]) {
      const b = o.bindings[side];
      if (!b) continue;
      const target = byId.get(b.objectId);
      const drop = !target || (moved.has(o.id) && !moved.has(b.objectId));
      if (drop) {
        const rest = { ...(line.bindings ?? {}) };
        delete rest[side];
        line = { ...line, bindings: rest.from || rest.to ? rest : undefined };
        if (!line.bindings) delete line.bindings;
      } else if (moved.has(b.objectId) && !moved.has(o.id)) {
        line = { ...line, [side]: anchorPoint(target, b.anchor) };
      }
    }
    if (line !== o) changed = true;
    return line;
  });
  return changed ? out : objects;
}

/** Remove ligações cujo objeto foi apagado (usado em todo commit). */
export function pruneBindings(objects: WhiteboardObject[]): WhiteboardObject[] {
  if (!objects.some((o) => o.type === 'line' && o.bindings)) return objects;
  return reconnect(objects, new Set());
}
