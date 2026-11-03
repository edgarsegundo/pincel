import { get, set } from 'idb-keyval';
import { store } from '../core/store';
import type { Viewport, WhiteboardObject } from '../core/types';
import { sanitizeObjects } from './validate';

interface SavedBoard { version: 1; objects: WhiteboardObject[]; viewport: Viewport; updatedAt: number }
const KEY = 'board';

export async function loadBoard() {
  try {
    const saved = await get<SavedBoard>(KEY);
    if (saved?.version === 1) store.setState({ objects: sanitizeObjects(saved.objects), viewport: saved.viewport });
  } catch { /* IndexedDB indisponível: segue em memória */ }
}

export function startAutosave() {
  let timer = 0;
  const save = () => {
    const { objects, viewport } = store.getState();
    set(KEY, { version: 1, objects, viewport, updatedAt: Date.now() } satisfies SavedBoard).catch(() => {});
  };
  const later = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(save) : save()), 1000);
  };
  let prev = store.getState();
  store.subscribe((s) => {
    if (s.objects !== prev.objects || s.viewport !== prev.viewport) later();
    prev = s;
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
}
