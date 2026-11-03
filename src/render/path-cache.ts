import type { Drawable } from 'roughjs/bin/core';
import { RoughGenerator } from 'roughjs/bin/generator';
import { STROKE_PX, type Shape } from '../core/types';
import { settings } from '../settings/settings';
import { diamondOutline } from '../shapes/geometry';
import { drawShape } from '../shapes';

/**
 * Formas no estilo "desenhado à mão". O Rough.js é usado só como GERADOR de caminhos:
 * gera uma vez por objeto/estilo, guarda Path2D e redesenha com ctx.stroke/fill.
 * A seed fixa de cada objeto mantém a aparência estável entre frames e sessões.
 */
const gen = new RoughGenerator();
const STROKE_TAG = '#s', FILL_TAG = '#f';

interface Piece { path: Path2D; kind: 'outline' | 'solid' | 'hatch'; width: number }
const cache = new WeakMap<Shape, { key: string; pieces: Piece[] }>();

function drawables(o: Shape, opts: Record<string, unknown>): Drawable[] {
  switch (o.type) {
    case 'rectangle': return [gen.rectangle(o.x, o.y, o.w, o.h, opts)];
    case 'diamond': return [gen.polygon(diamondOutline(o), opts)];
    case 'ellipse': return [gen.ellipse(o.cx, o.cy, o.rx * 2, o.ry * 2, opts)];
    case 'triangle': return [gen.polygon(o.vertices, opts)];
    case 'line': {
      const out = [gen.line(o.from[0], o.from[1], o.to[0], o.to[1], opts)];
      const head = (tip: [number, number], tail: [number, number]) => {
        const ang = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
        const len = Math.max(10, STROKE_PX[o.size] * 4);
        for (const s of [-1, 1]) out.push(gen.line(tip[0], tip[1], tip[0] - len * Math.cos(ang + s * 0.45), tip[1] - len * Math.sin(ang + s * 0.45), { ...opts, seed: o.seed + s }));
      };
      if (o.arrowhead !== 'none') head(o.to, o.from);
      if (o.arrowhead === 'both') head(o.from, o.to);
      return out;
    }
  }
}

function build(o: Shape, rough: boolean, roughness: number): Piece[] {
  const filled = 'fill' in o && o.fill && o.fill !== 'none';
  const w = STROKE_PX[o.size];
  const opts = {
    seed: o.seed || 1,
    roughness: rough ? roughness : 0,
    bowing: rough ? 1 : 0,
    strokeWidth: w,
    stroke: STROKE_TAG,
    fill: filled ? FILL_TAG : undefined,
    fillStyle: filled && o.fill === 'solid' ? 'solid' : 'hachure',
    fillWeight: Math.max(1, w / 2),
    hachureGap: w * 4,
    hachureAngle: -41,
    disableMultiStroke: !rough,
    disableMultiStrokeFill: true,
  };
  return drawables(o, opts).flatMap((d) => gen.toPaths(d)).map((p) => ({
    path: new Path2D(p.d),
    kind: p.fill && p.fill !== 'none' ? 'solid' : p.stroke === FILL_TAG ? 'hatch' : 'outline',
    width: p.strokeWidth || w,
  }));
}

/** Desenha uma forma no estilo atual (nativo e nítido quando "limpo" e sem preenchimento). */
export function drawStyledShape(ctx: CanvasRenderingContext2D, o: Shape, color: string) {
  const { shapeStyle, roughness } = settings.getState();
  const rough = shapeStyle === 'rough';
  const filled = 'fill' in o && o.fill && o.fill !== 'none';
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = STROKE_PX[o.size];
  ctx.lineJoin = ctx.lineCap = 'round';
  if (!rough && !filled) { drawShape(ctx, o); return; }

  const key = `${rough}|${roughness}|${'fill' in o ? o.fill : ''}`;
  let c = cache.get(o);
  if (!c || c.key !== key) {
    c = { key, pieces: build(o, rough, roughness) };
    cache.set(o, c);
  }
  const base = ctx.globalAlpha; // quem chama pode estar animando a opacidade (ex.: fade ao apagar)
  for (const p of c.pieces) {
    if (p.kind === 'solid') { ctx.globalAlpha = base * 0.22; ctx.fill(p.path); }
    else if (p.kind === 'hatch') { ctx.globalAlpha = base * 0.5; ctx.lineWidth = p.width; ctx.stroke(p.path); }
    else { ctx.globalAlpha = base; ctx.lineWidth = p.width; ctx.stroke(p.path); }
  }
  ctx.globalAlpha = base;
}
