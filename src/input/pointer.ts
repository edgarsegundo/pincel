import { addObject, commitFrom, preview, removeObjects, replaceObject, select, setViewport, store } from '../core/store';
import { reconnect } from '../core/bindings';
import { cloneObjects } from '../core/clipboard';
import { rid } from '../core/ids';
import type { Box, Freehand, Shape, Vec2, WhiteboardObject } from '../core/types';
import { detectScribble } from '../gestures/scribble';
import { beautify } from '../recognition/beautify';
import { config } from '../recognition/config';
import { convertStroke, morphPoints } from '../recognition/convert';
import { ai } from '../recognition/ai';
import { shapeFromVerdict } from '../recognition/ai/apply';
import { prepareAiRequest } from '../recognition/ai/request';
import { noteHoldConversion } from '../recognition/learning';
import { cueFor } from '../recognition/cue';
import { fadeOut, live, showCue, startMorph } from '../render/renderer';
import { bounds, canLabel, closedContaining, geomBox, pickAt, scaleObject, translate } from '../shapes';
import { dist } from '../shapes/geometry';
import { panBy, screenToBoard, zoomAt } from '../viewport/viewport';
import { settings, setSetting } from '../settings/settings';
import { blocked, startEdit, startEditLabel, startNewAt } from './text-capture';

type Renderer = { invalidateActive(): void; invalidateStatic(): void };

const CLICK_PX = 4;
const CLICK_MS = 300;

interface HoldShape { base: Shape; stroke: Freehand; anchor: Vec2; handle: Vec2; cur: Shape; adjusted: boolean }

export function attachInput(el: HTMLElement, renderer: Renderer) {
  let mode: 'none' | 'draw' | 'pan' | 'move' = 'none';
  let spaceDown = false;
  let lastX = 0, lastY = 0;
  let downX = 0, downY = 0, downT = 0;
  let moved = false;
  let lastShift = false;
  let hitAtDown: WhiteboardObject | undefined;
  let moveBase: WhiteboardObject[] = []; // estado para desfazer
  let moveObjs: WhiteboardObject[] = []; // objetos de partida do arrasto (inclui cópias)
  let dupPending = false;
  let moveStart: Vec2 = [0, 0];

  // reconhecimento
  let holdTimer = 0;
  let holdAnchor: Vec2 = [0, 0]; // posição de tela onde o ponteiro parou
  let hold: HoldShape | null = null;
  let suppressRelease = false; // cadência de escrita
  let lastStrokeEnd: { t: number; box: Box } | null = null;
  let pointerScreen: Vec2 = [0, 0]; // última posição do ponteiro durante o traço (tela)

  const toBoard = (e: { clientX: number; clientY: number }) => screenToBoard(store.getState().viewport, e.clientX, e.clientY);
  const zoom = () => store.getState().viewport.zoom;
  const tol = () => 4 / zoom();

  const addPoint = (e: PointerEvent, into: number[]) => {
    const [bx, by] = toBoard(e);
    const n = into.length;
    if (n >= 3 && Math.hypot(bx - into[n - 3]!, by - into[n - 2]!) * zoom() < 0.5) return;
    into.push(bx, by, e.pressure || 0.5);
  };

  const makeStroke = (): Freehand => {
    if (live.points.length === 3) live.points.push(live.points[0]! + 0.01, live.points[1]!, live.points[2]!);
    return { id: rid(), type: 'freehand', color: live.color, size: live.size, seed: (Math.random() * 2 ** 31) | 0, createdAt: Date.now(), points: live.points.slice() };
  };

  const ctxFor = () => ({ others: store.getState().objects, zoom: zoom() });

  // ---------- segurar parado ----------
  const armHold = () => {
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(tryHold, config.holdMs);
  };

  function tryHold() {
    if (mode !== 'draw' || hold || live.points.length < 6) return;
    const stroke = makeStroke();
    const shape = convertStroke(stroke, 'hold', ctxFor());
    if (shape) enterHold(stroke, shape);
    else holdWithAi(stroke); // segurar é intenção explícita: se o local não reconheceu, pergunta à IA
  }

  function enterHold(stroke: Freehand, shape: Shape) {
    if (shape.recognizedFrom!.source === 'local') noteHoldConversion(shape.type, shape.recognizedFrom!.confidence);
    const n = stroke.points.length;
    const last: Vec2 = [stroke.points[n - 3]!, stroke.points[n - 2]!];
    let anchor: Vec2, handle: Vec2;
    if (shape.type === 'line') {
      [anchor, handle] = dist(shape.from, last) > dist(shape.to, last) ? [shape.from, shape.to] : [shape.to, shape.from];
    } else {
      const b = geomBox(shape);
      const corners: Vec2[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
      const i = corners.reduce((best, c, k) => (dist(c, last) < dist(corners[best]!, last) ? k : best), 0);
      handle = corners[i]!;
      anchor = corners[(i + 2) % 4]!;
    }
    hold = { base: shape, stroke, anchor, handle, cur: shape, adjusted: false };
    const m = morphPoints(stroke.points, shape);
    startMorph(m.from, m.to, shape.color, shape.size, null);
    live.shapePreview = shape;
    renderer.invalidateActive();
  }

  // ---------- IA (JEV) em segundo plano ----------
  const anchorOf = (points: number[]): Vec2 => {
    const n = points.length, z = zoom();
    return [points[n - 3]! + 10 / z, points[n - 2]! - 10 / z]; // ponto "analisando" ao lado do fim do traço
  };

  function holdWithAi(stroke: Freehand) {
    const request = prepareAiRequest(stroke.points);
    if (!request) return;
    // Ainda segurando? (o ponteiro continua parado e sem soltar)
    const stillHolding = () => mode === 'draw' && !hold && live.active && Math.hypot(pointerScreen[0] - holdAnchor[0], pointerScreen[1] - holdAnchor[1]) <= config.holdMovePx;
    void ai.ask({ id: stroke.id, request, anchor: anchorOf(stroke.points), isIntact: stillHolding }).then((v) => {
      if (!v || !stillHolding()) return;
      const shape = shapeFromVerdict(stroke, v, ctxFor(), 'hold');
      if (shape) enterHold(stroke, shape);
    });
  }

  function releaseWithAi(stroke: Freehand) {
    const request = prepareAiRequest(stroke.points);
    if (!request) return;
    // Só vale se o traço continua exatamente como foi desenhado (não apagado, movido ou refeito).
    const intact = () => store.getState().objects.some((o) => o.id === stroke.id && o.type === 'freehand' && o.points === stroke.points);
    void ai.ask({ id: stroke.id, request, anchor: anchorOf(stroke.points), isIntact: intact }).then((v) => {
      if (!v) return;
      const shape = shapeFromVerdict(stroke, v, ctxFor(), 'release');
      if (shape) applyLateConversion(stroke, shape);
    });
  }

  /** Conversão que chega depois do traço já estar no quadro: um passo de histórico, desfazer restaura o traço. */
  function applyLateConversion(stroke: Freehand, shape: Shape) {
    replaceObject(shape);
    const m = morphPoints(stroke.points, shape);
    startMorph(m.from, m.to, shape.color, shape.size, shape.id);
    showCue(cueFor(shape, store.getState().objects));
  }

  function adjustHold(p: Vec2) {
    const h = hold!;
    h.adjusted = true;
    if (h.base.type === 'line') {
      const isFrom = h.anchor === h.base.from;
      h.cur = { ...h.base, from: isFrom ? h.anchor : p, to: isFrom ? p : h.anchor };
    } else {
      const k = (v: number, a: number, hd: number) => {
        const d = hd - a;
        if (Math.abs(d) < 1e-6) return 1;
        const s = (v - a) / d;
        return Math.abs(s) < 0.05 ? 0.05 * Math.sign(s || 1) : s;
      };
      h.cur = scaleObject(h.base, h.anchor, k(p[0], h.anchor[0], h.handle[0]), k(p[1], h.anchor[1], h.handle[1]));
    }
    live.shapePreview = h.cur;
    renderer.invalidateActive();
  }

  function eraseWithFade(ids: string[]) {
    const set = new Set(ids);
    fadeOut(store.getState().objects.filter((o) => set.has(o.id)));
    removeObjects(ids);
  }

  // ---------- fim do traço ----------
  function commitConversion(stroke: Freehand, shape: Shape, fromHold: boolean) {
    addObject(stroke); // 1º Cmd+Z restaura o traço; o 2º remove
    replaceObject(shape);
    showCue(cueFor(shape, store.getState().objects));
    if (fromHold) { // a animação já rodou quando a forma apareceu; não repetir
      if (live.morph) live.morph.hideId = shape.id;
      return;
    }
    const m = morphPoints(stroke.points, shape);
    startMorph(m.from, m.to, shape.color, shape.size, shape.id);
  }

  function finishStroke(e: PointerEvent) {
    const s = store.getState();
    const now = Date.now();
    const isClick = !moved && now - downT < CLICK_MS;

    if (hold) { // soltou depois de segurar: confirma (e ajusta, se houve arrasto)
      const shape = hold.adjusted ? beautify(hold.cur, ctxFor()) : hold.cur;
      commitConversion(hold.stroke, shape, true);
      if (s.selection.length) select([]);
      return;
    }
    if (isClick && hitAtDown) {
      const id = hitAtDown.id;
      select(lastShift ? (s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id]) : [id]);
      return;
    }
    if (isClick) { if (s.selection.length) select([]); return; }
    if (live.points.length < 3) return;

    // rabisco de apagar
    const hits = !settings.getState().scribbleErase ? null : detectScribble(live.points, zoom(), now - downT, s.objects);
    if (hits) { eraseWithFade(hits); return; }

    const stroke = makeStroke();
    const box = bounds(stroke);
    lastStrokeEnd = { t: now, box };
    const bigEnough = Math.max(box.w, box.h) * zoom() >= config.minSizePx;
    const forced = e.shiftKey; // Shift ao soltar força o endireitamento (limiar menor)
    const auto = (settings.getState().autoStraighten && bigEnough && !suppressRelease) || forced;
    const shape = auto ? convertStroke(stroke, forced ? 'hold' : 'release', ctxFor()) : null;
    if (shape) commitConversion(stroke, shape, false);
    else {
      addObject(stroke);
      if (auto) releaseWithAi(stroke); // ambíguo para o reconhecedor local: a IA decide em segundo plano
    }
    if (s.selection.length) select([]);
  }

  // ---------- eventos ----------
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    lastX = downX = e.clientX; lastY = downY = e.clientY; downT = Date.now(); moved = false; lastShift = e.shiftKey;
    if (e.button === 1 || spaceDown) { mode = 'pan'; return; }
    if (e.button !== 0) return;

    const s = store.getState();
    const p = toBoard(e);
    hitAtDown = pickAt(s.objects, p, tol());

    if (hitAtDown && s.selection.includes(hitAtDown.id) && !e.shiftKey) {
      moveBase = moveObjs = s.objects;
      dupPending = e.altKey;
      mode = 'move';
      moveStart = p;
      return;
    }

    mode = 'draw';
    hold = null;
    live.shapePreview = null;
    live.points = []; live.predicted = [];
    live.color = s.color; live.size = s.size; live.active = true;
    addPoint(e, live.points);
    holdAnchor = pointerScreen = [e.clientX, e.clientY];
    const z = s.viewport.zoom;
    suppressRelease = !!lastStrokeEnd && downT - lastStrokeEnd.t < config.cadenceMs &&
      p[0] > lastStrokeEnd.box.x - config.cadenceRadiusPx / z && p[0] < lastStrokeEnd.box.x + lastStrokeEnd.box.w + config.cadenceRadiusPx / z &&
      p[1] > lastStrokeEnd.box.y - config.cadenceRadiusPx / z && p[1] < lastStrokeEnd.box.y + lastStrokeEnd.box.h + config.cadenceRadiusPx / z;
    armHold();
    renderer.invalidateActive();
  });

  el.addEventListener('pointermove', (e) => {
    if (mode === 'none') {
      const s = store.getState();
      const h = pickAt(s.objects, toBoard(e), tol());
      el.style.cursor = spaceDown ? 'grab' : h && s.selection.includes(h.id) ? 'move' : '';
      return;
    }
    if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_PX) moved = true;

    if (mode === 'pan') {
      setViewport(panBy(store.getState().viewport, e.clientX - lastX, e.clientY - lastY));
      lastX = e.clientX; lastY = e.clientY;
    } else if (mode === 'move') {
      if (!moved) return;
      if (dupPending) { // Alt: as cópias só nascem quando o arrasto realmente começa
        const st = store.getState();
        const copies = cloneObjects(st.objects.filter((o) => st.selection.includes(o.id)));
        moveObjs = [...st.objects, ...copies];
        preview(moveObjs);
        select(copies.map((c) => c.id));
        dupPending = false;
      }
      const p = toBoard(e);
      live.drag = { ids: new Set(store.getState().selection), dx: p[0] - moveStart[0], dy: p[1] - moveStart[1] };
      renderer.invalidateStatic();
      renderer.invalidateActive();
    } else if (mode === 'draw') {
      pointerScreen = [e.clientX, e.clientY];
      if (hold) { adjustHold(toBoard(e)); return; }
      for (const ev of e.getCoalescedEvents?.() ?? [e]) addPoint(ev, live.points);
      live.predicted = [];
      for (const ev of e.getPredictedEvents?.() ?? []) addPoint(ev, live.predicted);
      if (Math.hypot(e.clientX - holdAnchor[0], e.clientY - holdAnchor[1]) > config.holdMovePx) {
        holdAnchor = [e.clientX, e.clientY];
        armHold();
      }
      renderer.invalidateActive();
    }
  });

  const end = (e: PointerEvent) => {
    clearTimeout(holdTimer);
    if (mode === 'draw') finishStroke(e);
    else if (mode === 'move') {
      const d = live.drag;
      if (d && (d.dx || d.dy)) {
        preview(reconnect(moveObjs.map((o) => (d.ids.has(o.id) ? translate(o, [d.dx, d.dy]) : o)), d.ids));
        commitFrom(moveBase);
      } else if (store.getState().objects !== moveBase) commitFrom(moveBase);
      live.drag = null;
    }
    hold = null;
    live.shapePreview = null;
    live.active = false; live.points = []; live.predicted = [];
    mode = 'none';
    renderer.invalidateActive();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // Trackpad: dois dedos = pan; pinça (ctrlKey) = zoom. Mouse: roda = pan; Cmd/Ctrl+roda = zoom.
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    let dx = e.deltaX * unit, dy = e.deltaY * unit;
    const v = store.getState().viewport;
    if (e.ctrlKey || e.metaKey) {
      setViewport(zoomAt(v, e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey && !e.metaKey ? 0.01 : 0.004))));
    } else {
      if (e.shiftKey && dx === 0) { dx = dy; dy = 0; }
      setViewport(panBy(v, -dx, -dy));
    }
  }, { passive: false });

  el.addEventListener('dblclick', (e) => {
    const p = toBoard(e);
    const objs = store.getState().objects;
    const h = pickAt(objs, p, tol());
    if (h?.type === 'text') { startEdit(h); return; }
    const closed = h && canLabel(h) ? h : closedContaining(objs, p);
    if (closed) startEditLabel(closed as Shape);
    else if (!h) startNewAt(p);
  });

  window.addEventListener('keydown', (e) => {
    if (blocked()) return;
    if (e.altKey && e.code === 'KeyA') { e.preventDefault(); setSetting('autoStraighten', !settings.getState().autoStraighten); return; }
    if (e.code === 'Enter') {
      e.preventDefault();
      const s = store.getState();
      const only = s.selection.length === 1 ? s.objects.find((o) => o.id === s.selection[0]) : undefined;
      if (only?.type === 'text') startEdit(only);
      else if (only && canLabel(only)) startEditLabel(only as Shape);
      return;
    }
    if (e.code === 'Space') { spaceDown = true; el.style.cursor = 'grab'; e.preventDefault(); }
    if ((e.code === 'Delete' || e.code === 'Backspace') && store.getState().selection.length) {
      e.preventDefault();
      eraseWithFade(store.getState().selection);
    }
    if (e.code === 'Escape') select([]);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; el.style.cursor = ''; }
  });
}
