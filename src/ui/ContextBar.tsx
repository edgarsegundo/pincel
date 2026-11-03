import { useSyncExternalStore } from 'preact/compat';
import { duplicate } from '../core/clipboard';
import { removeObjects, store, updateSelected } from '../core/store';
import type { ColorToken, Fill, Line, WhiteboardObject } from '../core/types';
import { t, type Key } from '../i18n';
import { settings } from '../settings/settings';
import { Arrow, ArrowBoth, Copy, FillHachure, FillNone, FillSolid, Minus, Trash } from './icons';

const COLORS: ColorToken[] = ['ink', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'violet'];
const CLOSED = new Set(['rectangle', 'diamond', 'ellipse', 'triangle']);
const FILLS: [Fill, () => preact.JSX.Element][] = [['none', FillNone], ['solid', FillSolid], ['hachure', FillHachure]];
const ARROWS: [Line['arrowhead'], () => preact.JSX.Element][] = [['none', Minus], ['end', Arrow], ['both', ArrowBoth]];

/** Barra que aparece quando há seleção: cor, preenchimento, seta, duplicar, apagar. */
export function ContextBar() {
  const selection = useSyncExternalStore(store.subscribe, () => store.getState().selection);
  const objects = useSyncExternalStore(store.subscribe, () => store.getState().objects);
  useSyncExternalStore(settings.subscribe, () => settings.getState().language); // re-renderiza ao trocar o idioma
  if (!selection.length) return null;

  const sel = objects.filter((o) => selection.includes(o.id));
  const hasClosed = sel.some((o) => CLOSED.has(o.type));
  const hasLine = sel.some((o) => o.type === 'line');
  const set = (f: (o: WhiteboardObject) => WhiteboardObject) => updateSelected(f);

  return (
    <div class="ctxbar" role="toolbar">
      {COLORS.map((c) => (
        <button class="btn" title={t(`color.${c}` as Key)} onClick={() => set((o) => ({ ...o, color: c }))}>
          <span class="swatch" style={{ background: `var(--draw-${c})` }} />
        </button>
      ))}
      {hasClosed && <span class="sep" />}
      {hasClosed && FILLS.map(([f, Icon]) => (
        <button class="btn" title={t(`fill.${f}` as Key)} onClick={() => set((o) => (CLOSED.has(o.type) ? ({ ...o, fill: f } as WhiteboardObject) : o))}><Icon /></button>
      ))}
      {hasLine && <span class="sep" />}
      {hasLine && ARROWS.map(([a, Icon]) => (
        <button class="btn" title={t(`arrow.${a}` as Key)} onClick={() => set((o) => (o.type === 'line' ? { ...o, arrowhead: a } : o))}><Icon /></button>
      ))}
      <span class="sep" />
      <button class="btn" title={t('duplicate')} onClick={duplicate}><Copy /></button>
      <button class="btn" title={t('delete')} onClick={() => removeObjects(selection)}><Trash /></button>
    </div>
  );
}
