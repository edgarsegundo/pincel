import { commit, select, store } from './store';
import { rid } from './ids';
import type { WhiteboardObject } from './types';
import { translate } from '../shapes';

let clip: WhiteboardObject[] = [];
let pasteCount = 0;

/** Clona com ids novos. Ligações de linhas são remapeadas para as cópias ou removidas. */
export function cloneObjects(objs: WhiteboardObject[], offset = 0): WhiteboardObject[] {
  const ids = new Map(objs.map((o) => [o.id, rid()]));
  return objs.map((o) => {
    const moved = offset ? translate(o, [offset, offset]) : o;
    const copy = { ...moved, id: ids.get(o.id)!, createdAt: Date.now() } as WhiteboardObject;
    if (copy.type === 'line' && copy.bindings) {
      const b: NonNullable<typeof copy.bindings> = {};
      for (const side of ['from', 'to'] as const) {
        const old = copy.bindings[side];
        if (old && ids.has(old.objectId)) b[side] = { ...old, objectId: ids.get(old.objectId)! };
      }
      if (b.from || b.to) copy.bindings = b;
      else delete copy.bindings;
    }
    return copy;
  });
}

const selected = () => {
  const s = store.getState();
  return s.objects.filter((o) => s.selection.includes(o.id));
};

function addAndSelect(copies: WhiteboardObject[]) {
  commit([...store.getState().objects, ...copies]);
  select(copies.map((c) => c.id));
}

export function copy() { clip = selected(); pasteCount = 0; }
export function cut() { copy(); const ids = clip.map((o) => o.id); commit(store.getState().objects.filter((o) => !ids.includes(o.id))); select([]); }
export function paste() { if (clip.length) addAndSelect(cloneObjects(clip, 16 * ++pasteCount)); }
export function duplicate() { const sel = selected(); if (sel.length) addAndSelect(cloneObjects(sel, 16)); }
export function selectAll() { select(store.getState().objects.map((o) => o.id)); }
