import type { Vec2, Viewport } from '../core/types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export const screenToBoard = (v: Viewport, x: number, y: number): Vec2 => [
  (x - v.x) / v.zoom,
  (y - v.y) / v.zoom,
];

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/** Zoom mantendo o ponto (cx, cy) da tela fixo. */
export function zoomAt(v: Viewport, cx: number, cy: number, factor: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const k = zoom / v.zoom;
  return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}

/** Enquadra a caixa na tela com margem. */
export function fitBox(b: { x: number; y: number; w: number; h: number }, width: number, height: number, margin = 80): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((width - margin * 2) / (b.w || 1), (height - margin * 2) / (b.h || 1), 1.5)));
  return { zoom, x: width / 2 - (b.x + b.w / 2) * zoom, y: height / 2 - (b.y + b.h / 2) * zoom };
}
