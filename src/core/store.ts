import { createStore } from 'zustand/vanilla';
import { pruneBindings } from './bindings';
import type { ColorToken, Fill, Size, Viewport, WhiteboardObject } from './types';

export interface BoardState {
  objects: WhiteboardObject[];
  viewport: Viewport;
  color: ColorToken;
  size: Size;
  fill: Fill;
  settingsOpen: boolean;
  trainingOpen: boolean;
  toast: 'cleared' | 'imported' | 'importError' | null;
  selection: string[];
  past: WhiteboardObject[][];
  future: WhiteboardObject[][];
}

export const store = createStore<BoardState>(() => ({
  objects: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  color: 'ink',
  size: 'm',
  fill: 'none',
  settingsOpen: false,
  trainingOpen: false,
  toast: null,
  selection: [],
  past: [],
  future: [],
}));

const HISTORY_LIMIT = 200;

/** Toda mudança no documento passa por aqui e entra no histórico. */
export function commit(next: WhiteboardObject[]) {
  next = pruneBindings(next);
  store.setState((s) => ({
    objects: next,
    past: [...s.past, s.objects].slice(-HISTORY_LIMIT),
    future: [],
    toast: null, // a notificação "Desfazer" só vale para a ação que a gerou
  }));
}

export const addObject = (o: WhiteboardObject) => commit([...store.getState().objects, o]);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(toast: 'cleared' | 'imported' | 'importError') {
  store.setState({ toast });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => store.setState({ toast: null }), 5000);
}

export const clearBoard = () => {
  if (!store.getState().objects.length) return;
  commit([]);
  store.setState({ selection: [] });
  showToast('cleared');
};

export const select = (selection: string[]) => store.setState({ selection });

export function removeObjects(ids: string[]) {
  if (!ids.length) return;
  const set = new Set(ids);
  commit(store.getState().objects.filter((o) => !set.has(o.id)));
  store.setState({ selection: [] });
}

/** Mostra uma mudança sem criar entrada no histórico (ex.: arrastando). */
export const preview = (objects: WhiteboardObject[]) => store.setState({ objects });

/** Fecha uma mudança iniciada com preview(): uma única entrada no histórico. */
export function commitFrom(base: WhiteboardObject[]) {
  store.setState((s) => ({ past: [...s.past, base].slice(-HISTORY_LIMIT), future: [], toast: null }));
}

/** Ganchos para módulos que reagem a eventos do núcleo sem criar dependência circular. */
export const hooks: { onConversionUndone?: (o: WhiteboardObject) => void } = {};

/** Troca um objeto por outro (mesmo id) como uma entrada de histórico. */
export function replaceObject(next: WhiteboardObject) {
  commit(store.getState().objects.map((o) => (o.id === next.id ? next : o)));
}

/** Aplica uma mudança aos objetos selecionados como uma única entrada de histórico. */
export function updateSelected(patch: (o: WhiteboardObject) => WhiteboardObject) {
  const s = store.getState();
  if (!s.selection.length) return;
  const sel = new Set(s.selection);
  commit(s.objects.map((o) => (sel.has(o.id) ? patch(o) : o)));
}

/**
 * Troca o quadro inteiro (ex.: importação) e leva a tela junto: desfazer devolve a tela de antes,
 * refazer devolve a de depois. Só vale para esta transição; desfazer outras ações não mexe na tela.
 */
const viewportMeta = new WeakMap<WhiteboardObject[], { prev: WhiteboardObject[]; before: Viewport; after: Viewport }>();

export function commitWithViewport(next: WhiteboardObject[], after: Viewport) {
  const { objects: prev, viewport: before } = store.getState();
  commit(next);
  const now = store.getState().objects;
  viewportMeta.set(now, { prev, before, after });
  setViewport(after);
}

export function undo() {
  const s = store.getState();
  const prev = s.past.at(-1);
  if (!prev) return;
  const converted = s.objects.find((o) => o.recognizedFrom && Date.now() - o.recognizedFrom.at < 5000 && prev.find((p) => p.id === o.id)?.type === 'freehand');
  if (converted) hooks.onConversionUndone?.(converted);
  const meta = viewportMeta.get(s.objects);
  if (meta && meta.prev === prev) setViewport(meta.before);
  store.setState({ toast: null, selection: [], objects: prev, past: s.past.slice(0, -1), future: [s.objects, ...s.future] });
}

export function redo() {
  const s = store.getState();
  const next = s.future[0];
  if (!next) return;
  const meta = viewportMeta.get(next);
  if (meta && meta.prev === s.objects) setViewport(meta.after);
  store.setState({ toast: null, selection: [], objects: next, past: [...s.past, s.objects], future: s.future.slice(1) });
}

export function setViewport(v: Viewport) {
  store.setState({ viewport: v });
}
