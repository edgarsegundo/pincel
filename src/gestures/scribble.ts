import type { Vec2, WhiteboardObject } from '../core/types';
import { pickAll } from '../shapes';
import { bboxOf, dist, polylineLength, resample } from '../shapes/geometry';
import { toVecs } from '../recognition/prepare';

/**
 * Rabisco de apagar: ≥ 4 inversões bruscas (> 120°), comprimento ≥ 3× a diagonal,
 * feito em ≤ 800 ms e tocando ao menos um objeto. Devolve os ids tocados.
 */
export function detectScribble(flat: number[], zoom: number, durationMs: number, objects: WhiteboardObject[]): string[] | null {
  if (durationMs > 800) return null;
  const screen = toVecs(flat).map(([x, y]): Vec2 => [x * zoom, y * zoom]);
  if (screen.length < 6) return null;

  // remove segmentos curtos para medir viradas reais
  const pts: Vec2[] = [screen[0]!];
  for (const p of screen) if (dist(p, pts[pts.length - 1]!) >= 6) pts.push(p);
  let turns = 0;
  for (let i = 2; i < pts.length; i++) {
    const ax = pts[i - 1]![0] - pts[i - 2]![0], ay = pts[i - 1]![1] - pts[i - 2]![1];
    const bx = pts[i]![0] - pts[i - 1]![0], by = pts[i]![1] - pts[i - 1]![1];
    const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    if (cos < -0.5) turns++;
  }
  if (turns < 4) return null;

  const box = bboxOf(screen);
  if (polylineLength(screen) < 3 * Math.hypot(box.w, box.h)) return null;

  // amostra a cada ~4 px de tela e coleta tudo que o traço tocou
  const board = toVecs(flat);
  const n = Math.min(400, Math.max(8, Math.ceil(polylineLength(screen) / 4)));
  const hit = new Set<string>();
  for (const p of resample(board, n)) for (const o of pickAll(objects, p, 4 / zoom)) hit.add(o.id);
  return hit.size ? [...hit] : null;
}
