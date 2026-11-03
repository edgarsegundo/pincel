import { commitWithViewport, select, showToast, store } from '../core/store';
import { drawObjectsTo } from '../render/renderer';
import { bounds } from '../shapes';
import { parseBoard } from './validate';

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportJSON() {
  const { objects, viewport } = store.getState();
  const board = { version: 1, objects, viewport, updatedAt: Date.now() };
  download(new Blob([JSON.stringify(board)], { type: 'application/json' }), `pincel-${stamp()}.json`);
}

/** PNG recortado ao conteúdo (margem de 32), 2x, com o fundo do tema atual. */
export async function exportPNG() {
  const { objects } = store.getState();
  if (!objects.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objects) {
    const b = bounds(o);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  const m = 32;
  x0 -= m; y0 -= m; x1 += m; y1 += m;
  const scale = Math.min(2, 8192 / Math.max(x1 - x0, y1 - y0));
  const c = document.createElement('canvas');
  c.width = Math.ceil((x1 - x0) * scale);
  c.height = Math.ceil((y1 - y0) * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await document.fonts.ready;
  ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
  drawObjectsTo(ctx, objects);
  c.toBlob((b) => b && download(b, `pincel-${stamp()}.png`), 'image/png');
}

/** Importa um JSON do Pincel. É uma ação desfazível; arquivo inválido não altera o quadro. */
export async function importFile(file: File) {
  const board = parseBoard(await file.text());
  if (!board) { showToast('importError'); return; }
  commitWithViewport(board.objects, board.viewport);
  select([]);
  showToast('imported');
}
