import getStroke from 'perfect-freehand';
import { store } from '../core/store';
import { STROKE_PX, type ColorToken, type Freehand, type Size, type WhiteboardObject } from '../core/types';
import { bounds, labelBoxOf } from '../shapes';
import { drawLabel, drawText } from '../shapes/text';
import type { Shape, Vec2 } from '../core/types';
import { drawStyledShape } from './path-cache';
import { config } from '../recognition/config';

const COLOR_TOKENS: ColorToken[] = ['ink', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'violet'];

/** Estado transitório do traço em andamento (fora do store, por desempenho). */
export const live = {
  points: [] as number[], // x, y, p intercalados, em coordenadas do quadro
  predicted: [] as number[],
  color: 'ink' as ColorToken,
  size: 'm' as Size,
  active: false,
  /** Arrasto em andamento: só desloca o desenho; os objetos mudam ao soltar. */
  editingId: null as string | null,
  editingLabelId: null as string | null,
  /** Objetos recém-apagados que somem com fade (desenhados na camada ativa). */
  fading: null as null | { objs: WhiteboardObject[]; t0: number },
  /** Pedidos à IA em andamento (o coordenador compartilha este mapa): mostram o ponto "analisando". */
  pending: new Map<string, { x: number; y: number; t0: number }>(),
  /** Dicas visuais curtas: guias de alinhamento, pontos e contornos de conexão. */
  cue: null as null | { t0: number; lines: number[][]; dots: Vec2[]; outlines: Vec2[][] },
  /** Forma em pré-visualização durante o "segurar parado" (desenhada na camada ativa). */
  shapePreview: null as Shape | null,
  /** Animação traço → forma. hideId esconde o objeto real até terminar. */
  morph: null as null | { from: Vec2[]; to: Vec2[]; t0: number; color: ColorToken; size: Size; hideId: string | null },
  drag: null as null | { ids: Set<string>; dx: number; dy: number },
};

const pathCache = new WeakMap<Freehand, Path2D>();
let colors: Record<string, string> = {};
let accent = '#3b82f6';

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  accent = cs.getPropertyValue('--accent').trim() || accent;
  colors = Object.fromEntries(COLOR_TOKENS.map((t) => [t, cs.getPropertyValue(`--draw-${t}`).trim()]));
}

function outlinePath(points: number[], size: Size, complete: boolean): Path2D {
  const pts: number[][] = [];
  for (let i = 0; i < points.length; i += 3) pts.push([points[i]!, points[i + 1]!, points[i + 2]!]);
  const outline = getStroke(pts, {
    size: STROKE_PX[size] * 1.6,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: true,
    last: complete,
  });
  const p = new Path2D();
  if (outline.length < 2) return p;
  p.moveTo(outline[0]![0]!, outline[0]![1]!);
  for (let i = 1; i < outline.length - 1; i++) {
    const [x0, y0] = outline[i]!;
    const [x1, y1] = outline[i + 1]!;
    p.quadraticCurveTo(x0!, y0!, (x0! + x1!) / 2, (y0! + y1!) / 2);
  }
  p.closePath();
  return p;
}

function drawStrokeShape(ctx: CanvasRenderingContext2D, o: Shape, color: string) {
  drawStyledShape(ctx, o, color);
}

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

function drawMorph(ctx: CanvasRenderingContext2D, m: NonNullable<typeof live.morph>, t: number) {
  const k = easeOutBack(t);
  ctx.strokeStyle = colors[m.color] ?? '#000';
  ctx.lineWidth = STROKE_PX[m.size];
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  m.from.forEach((a, i) => {
    const b = m.to[i]!;
    const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

/** Medições para os testes de desempenho. */
export const stats = { lastStaticMs: 0, maxActiveMs: 0, frames: 0 };

export const FADE_MS = 120;
export const CUE_MS = 300;

export function fadeOut(objs: WhiteboardObject[]) { live.fading = { objs, t0: performance.now() }; }
export function showCue(c: Omit<NonNullable<typeof live.cue>, 't0'>) { live.cue = { ...c, t0: performance.now() }; }

/** Desenha objetos num contexto qualquer (exportação PNG), no tema atual. */
export function drawObjectsTo(ctx: CanvasRenderingContext2D, objects: WhiteboardObject[]) {
  for (const o of objects) { ctx.fillStyle = colors[o.color] ?? '#000'; drawObject(ctx, o); }
}

export function startMorph(from: Vec2[], to: Vec2[], color: ColorToken, size: Size, hideId: string | null) {
  live.morph = { from, to, t0: performance.now(), color, size, hideId };
}

/** Durante o arrasto, linhas ligadas a formas movidas já acompanham (sem mudar os dados). */
function followDrag(o: WhiteboardObject): WhiteboardObject {
  const d = live.drag;
  if (!d || o.type !== 'line' || !o.bindings || d.ids.has(o.id)) return o;
  const f = o.bindings.from && d.ids.has(o.bindings.from.objectId);
  const t = o.bindings.to && d.ids.has(o.bindings.to.objectId);
  if (!f && !t) return o;
  return { ...o, from: f ? [o.from[0] + d.dx, o.from[1] + d.dy] : o.from, to: t ? [o.to[0] + d.dx, o.to[1] + d.dy] : o.to };
}

function drawObject(ctx: CanvasRenderingContext2D, o: WhiteboardObject) {
  if (o.type === 'freehand') ctx.fill(pathFor(o));
  else if (o.type === 'text') drawText(ctx, o);
  else {
    drawStrokeShape(ctx, o, colors[o.color] ?? '#000');
    if ('label' in o && o.label && o.id !== live.editingLabelId) {
      ctx.fillStyle = colors[o.color] ?? '#000';
      drawLabel(ctx, o, labelBoxOf(o));
    }
  }
}

function pathFor(o: Freehand): Path2D {
  let p = pathCache.get(o);
  if (!p) {
    p = outlinePath(o.points, o.size, true);
    pathCache.set(o, p);
  }
  return p;
}

export function createRenderer(staticCanvas: HTMLCanvasElement, activeCanvas: HTMLCanvasElement) {
  const sctx = staticCanvas.getContext('2d')!;
  const actx = activeCanvas.getContext('2d', { desynchronized: true })!;
  let dprScale = 1;
  let dirtyStatic = true;
  let dirtyActive = true;
  let raf = 0;

  function resize() {
    dprScale = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [staticCanvas, activeCanvas]) {
      c.width = Math.round(window.innerWidth * dprScale);
      c.height = Math.round(window.innerHeight * dprScale);
    }
    dirtyStatic = dirtyActive = true;
  }

  function applyView(ctx: CanvasRenderingContext2D) {
    const { viewport: v } = store.getState();
    ctx.setTransform(dprScale * v.zoom, 0, 0, dprScale * v.zoom, dprScale * v.x, dprScale * v.y);
  }

  function frame() {
    raf = 0;
    stats.frames++;
    // Termina a animação ANTES de desenhar: a forma real entra na camada estática
    // no mesmo frame em que a animação sai da ativa (sem piscar).
    if (live.morph && performance.now() - live.morph.t0 >= config.morphMs) {
      live.morph = null;
      dirtyStatic = dirtyActive = true;
    }
    if (dirtyStatic) {
      const t0 = performance.now();
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
      applyView(sctx);
      const vp = store.getState().viewport;
      const view = { x0: -vp.x / vp.zoom, y0: -vp.y / vp.zoom, x1: (staticCanvas.width / dprScale - vp.x) / vp.zoom, y1: (staticCanvas.height / dprScale - vp.y) / vp.zoom };
      for (const o of store.getState().objects) {
        if (!live.drag) { // fora da tela: não desenha (durante arrasto, desenha tudo por simplicidade)
          const b = bounds(o);
          if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
        }
        sctx.fillStyle = colors[o.color] ?? '#000';
        const moved = live.drag?.ids.has(o.id) ? live.drag : null;
        if (moved) { sctx.save(); sctx.translate(moved.dx, moved.dy); }
        if (o.id !== live.editingId && o.id !== live.morph?.hideId) drawObject(sctx, followDrag(o));
        if (moved) sctx.restore();
      }
      dirtyStatic = false;
      stats.lastStaticMs = performance.now() - t0;
    }
    if (dirtyActive) {
      const ta = performance.now();
      actx.setTransform(1, 0, 0, 1, 0, 0);
      actx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
      applyView(actx);
      const st = store.getState();
      if (st.selection.length) {
        const z = st.viewport.zoom;
        actx.strokeStyle = accent;
        actx.lineWidth = 1.5 / z;
        const pad = 4 / z;
        const sel = new Set(st.selection);
        for (const o of st.objects) {
          if (!sel.has(o.id)) continue;
          const b = bounds(o);
          const ox = live.drag?.dx ?? 0, oy = live.drag?.dy ?? 0;
          actx.beginPath();
          actx.roundRect(b.x + ox - pad, b.y + oy - pad, b.w + pad * 2, b.h + pad * 2, 6 / z);
          actx.stroke();
        }
      }
      if (live.morph) {
        drawMorph(actx, live.morph, Math.max(0, (performance.now() - live.morph.t0) / config.morphMs));
      }
      const now = performance.now();
      if (live.fading) {
        const t = (now - live.fading.t0) / FADE_MS;
        if (t >= 1) live.fading = null;
        else { actx.globalAlpha = 1 - t; drawObjectsTo(actx, live.fading.objs); actx.globalAlpha = 1; }
      }
      if (live.cue) {
        const c = live.cue, t = (now - c.t0) / CUE_MS;
        if (t >= 1) live.cue = null;
        else {
          const z = store.getState().viewport.zoom;
          actx.globalAlpha = 1 - t;
          actx.strokeStyle = actx.fillStyle = accent;
          actx.lineWidth = 1 / z;
          for (const [x1, y1, x2, y2] of c.lines) { actx.beginPath(); actx.moveTo(x1!, y1!); actx.lineTo(x2!, y2!); actx.stroke(); }
          actx.lineWidth = 2 / z;
          for (const o of c.outlines) { actx.beginPath(); o.forEach(([x, y], i) => (i ? actx.lineTo(x, y) : actx.moveTo(x, y))); actx.closePath(); actx.stroke(); }
          for (const [x, y] of c.dots) { actx.beginPath(); actx.arc(x, y, 4 / z, 0, Math.PI * 2); actx.fill(); }
          actx.globalAlpha = 1;
        }
      }
      if (live.pending.size) {
        const z = store.getState().viewport.zoom;
        for (const p of live.pending.values()) {
          if (now - p.t0 < config.aiIndicatorDelayMs) continue; // só aparece se demorar
          const pulse = 0.5 + 0.5 * Math.sin(now / 180);
          actx.globalAlpha = 0.35 + 0.5 * pulse;
          actx.fillStyle = accent;
          actx.beginPath();
          actx.arc(p.x, p.y, (3.5 + 1.5 * pulse) / z, 0, Math.PI * 2);
          actx.fill();
        }
        actx.globalAlpha = 1;
      }
      if (live.shapePreview && !live.morph) drawStrokeShape(actx, live.shapePreview, colors[live.shapePreview.color] ?? '#000');
      if (live.active && !live.shapePreview && !live.morph && live.points.length >= 3) {
        actx.fillStyle = colors[live.color] ?? '#000';
        actx.fill(outlinePath([...live.points, ...live.predicted], live.size, false));
      }
      dirtyActive = false;
      stats.maxActiveMs = Math.max(stats.maxActiveMs, performance.now() - ta);
    }
    if (live.morph || live.fading || live.cue || live.pending.size) { dirtyActive = true; schedule(); }
    else if (dirtyStatic) schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  readColors();
  resize();
  window.addEventListener('resize', () => { resize(); schedule(); });

  let prev = store.getState();
  store.subscribe((s) => {
    if (s.objects !== prev.objects || s.viewport !== prev.viewport) dirtyStatic = dirtyActive = true;
    if (s.selection !== prev.selection) dirtyActive = true;
    prev = s;
    schedule();
  });

  return {
    refreshColors() { readColors(); dirtyStatic = dirtyActive = true; schedule(); },
    invalidateActive() { dirtyActive = true; schedule(); },
    invalidateStatic() { dirtyStatic = true; schedule(); },
  };
}
