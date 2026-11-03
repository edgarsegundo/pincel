import { useSyncExternalStore } from 'preact/compat';
import { clearBoard, redo, store, undo } from '../core/store';
import type { ColorToken, Fill, Size } from '../core/types';
import { t, type Key } from '../i18n';
import { effectiveTheme, setSetting, settings } from '../settings/settings';
import { fitContent } from '../viewport/actions';
import { ContextBar } from './ContextBar';
import { Menu } from './Menu';
import { FillHachure, FillNone, FillSolid, Gear, Moon, Pencil, Redo, Square, Sun, Trash, Undo, Wand } from './icons';
import { SettingsSheet } from './SettingsSheet';

const COLORS: ColorToken[] = ['ink', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'violet'];
const SIZES: Size[] = ['s', 'm', 'l'];
const DOT_PX = { s: 5, m: 8, l: 12 };
const NEXT_FILL: Record<Fill, Fill> = { none: 'solid', solid: 'hachure', hachure: 'none' };
const FILL_ICON = { none: FillNone, solid: FillSolid, hachure: FillHachure };

const useStore = <T,>(sel: (s: ReturnType<typeof store.getState>) => T) =>
  useSyncExternalStore(store.subscribe, () => sel(store.getState()));
const useSettings = <T,>(sel: (s: ReturnType<typeof settings.getState>) => T) =>
  useSyncExternalStore(settings.subscribe, () => sel(settings.getState()));

export function App() {
  const color = useStore((s) => s.color);
  const size = useStore((s) => s.size);
  const fill = useStore((s) => s.fill);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const empty = useStore((s) => s.objects.length === 0);
  const toast = useStore((s) => s.toast);
  const zoomPct = useStore((s) => Math.round(s.viewport.zoom * 100));
  const auto = useSettings((s) => s.autoStraighten);
  const rough = useSettings((s) => s.shapeStyle === 'rough');
  useSettings((s) => s.language); // re-renderiza ao trocar o idioma
  const dark = useSettings(() => effectiveTheme() === 'dark');
  const FillIcon = FILL_ICON[fill];

  return (
    <>
      <div class={`hint ${empty ? '' : 'hidden'}`}>{t('hint')}</div>
      <ContextBar />
      <div class="toolbar" role="toolbar">
        {COLORS.map((c) => (
          <button class="btn" aria-pressed={c === color} title={t(`color.${c}` as Key)} onClick={() => store.setState({ color: c })}>
            <span class="swatch" style={{ background: `var(--draw-${c})` }} />
          </button>
        ))}
        <span class="sep" />
        {SIZES.map((s) => (
          <button class="btn" aria-pressed={s === size} title={t(`size.${s}` as Key)} onClick={() => store.setState({ size: s })}>
            <span class="dot" style={{ width: DOT_PX[s], height: DOT_PX[s] }} />
          </button>
        ))}
        <span class="sep" />
        <button class="btn" title={t(`fill.${fill}` as Key)} onClick={() => store.setState({ fill: NEXT_FILL[fill] })}><FillIcon /></button>
        <button class="btn" aria-pressed={rough} title={t('style')} onClick={() => setSetting('shapeStyle', rough ? 'clean' : 'rough')}>{rough ? <Pencil /> : <Square />}</button>
        <button class="btn" aria-pressed={auto} title={t('auto')} onClick={() => setSetting('autoStraighten', !auto)}><Wand /></button>
        <span class="sep" />
        <button class="btn" title={t('undo')} disabled={!canUndo} onClick={undo}><Undo /></button>
        <button class="btn" title={t('redo')} disabled={!canRedo} onClick={redo}><Redo /></button>
        <button class="btn" title={t('clear')} disabled={empty} onClick={clearBoard}><Trash /></button>
        <span class="sep" />
        <Menu />
        <button class="btn" title={t('theme')} onClick={() => setSetting('theme', dark ? 'light' : 'dark')}>{dark ? <Sun /> : <Moon />}</button>
        <button class="btn" title={t('settings')} onClick={() => store.setState({ settingsOpen: true })}><Gear /></button>
      </div>
      {toast && (
        <div class="toast" role="status">
          <span>{t(toast)}</span>
          {toast !== 'importError' && <button onClick={() => { undo(); store.setState({ toast: null }); }}>{t('undoAction')}</button>}
        </div>
      )}
      <button class="zoom" title={t('zoomFit')} onClick={fitContent}>{zoomPct}%</button>
      <SettingsSheet />
    </>
  );
}
