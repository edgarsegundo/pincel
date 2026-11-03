import { setViewport, store } from '../core/store';
import { bounds } from '../shapes';
import { fitBox, zoomAt } from './viewport';

export function fitContent() {
  const { objects } = store.getState();
  if (!objects.length) { setViewport({ x: 0, y: 0, zoom: 1 }); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objects) {
    const b = bounds(o);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  setViewport(fitBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, window.innerWidth, window.innerHeight));
}

/** Zoom 100% mantendo o centro da tela fixo. */
export function resetZoom() {
  const v = store.getState().viewport;
  setViewport(zoomAt(v, window.innerWidth / 2, window.innerHeight / 2, 1 / v.zoom));
}
