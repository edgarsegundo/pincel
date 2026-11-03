import { h, render } from 'preact';
import { copy, cut, duplicate, paste, selectAll } from './core/clipboard';
import { redo, store, undo } from './core/store';
import { attachInput } from './input/pointer';
import { blocked, initTextCapture } from './input/text-capture';
import { importFile } from './persistence/export';
import { fitContent, resetZoom } from './viewport/actions';
import { loadBoard, startAutosave } from './persistence/storage';
import { ai } from './recognition/ai';
import { createRenderer, live, stats } from './render/renderer';
import { settings, effectiveTheme } from './settings/settings';
import { invalidateBounds } from './shapes';
import { clearTextCache } from './shapes/text';
import './ui/app.css';
import './ui/tokens.css';

// Etapa 1: núcleo + canvas (já dá para desenhar). Etapa 2: UI.
const board = document.getElementById('board')!;
const layerStatic = document.getElementById('layer-static') as HTMLCanvasElement;
const layerActive = document.getElementById('layer-active') as HTMLCanvasElement;

const applyChrome = () => {
  document.documentElement.dataset.theme = effectiveTheme();
  board.classList.toggle('no-grid', !settings.getState().grid);
  document.documentElement.lang = settings.getState().language;
};
applyChrome();

const renderer = createRenderer(layerStatic, layerActive);
attachInput(layerActive, renderer);
initTextCapture(renderer);
live.pending = ai.pending; // o renderizador desenha o ponto "analisando" dos pedidos pendentes
ai.onChange = () => renderer.invalidateActive();
document.fonts.load('500 30px Caveat').then(() => { clearTextCache(); invalidateBounds(); renderer.invalidateStatic(); });

let prevSettings = settings.getState();
settings.subscribe((s) => {
  applyChrome();
  if (s.theme !== prevSettings.theme) renderer.refreshColors();
  if (s.shapeStyle !== prevSettings.shapeStyle || s.roughness !== prevSettings.roughness) renderer.invalidateStatic();
  prevSettings = s;
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyChrome();
  renderer.refreshColors();
});

store.subscribe((s, prev) => {
  if (s.viewport !== prev.viewport) {
    const { x, y, zoom } = s.viewport;
    board.style.setProperty('--zoom', String(zoom));
    board.style.setProperty('--ox', `${x}px`);
    board.style.setProperty('--oy', `${y}px`);
  }
});

const shortcuts: Record<string, (shift: boolean) => void> = {
  KeyZ: (shift) => (shift ? redo() : undo()),
  Digit0: () => resetZoom(), Digit1: () => fitContent(),
  KeyC: copy, KeyX: cut, KeyV: paste, KeyD: duplicate, KeyA: selectAll,
};
window.addEventListener('keydown', (e) => {
  if (blocked() || !(e.metaKey || e.ctrlKey)) return;
  const fn = shortcuts[e.code];
  if (!fn) return;
  e.preventDefault();
  fn(e.shiftKey);
});

loadBoard().then(startAutosave);

import('./ui/App').then(({ App }) => render(h(App, {}), document.getElementById('ui')!));

// Arrastar um .json para a janela abre o quadro.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f && (f.type === 'application/json' || f.name.endsWith('.json'))) importFile(f);
});

// Gancho para testes e2e (não existe no build de produção).
if (import.meta.env.DEV) Object.assign(window, { __pincel: { store, settings, renderer, stats, live, ai } });
