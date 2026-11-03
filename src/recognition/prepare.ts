import type { Box, Vec2 } from '../core/types';
import { bboxOf, dist, polylineLength, resample } from '../shapes/geometry';
import { config } from './config';

export interface Prepared {
  pts: Vec2[]; // 64 pontos equidistantes
  length: number;
  box: Box;
  diag: number;
  gap: number; // distância início–fim / comprimento
  closed: boolean;
  closeFactor: number; // penalidade por fechamento frouxo
}

export function toVecs(flat: number[]): Vec2[] {
  const v: Vec2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 3) v.push([flat[i]!, flat[i + 1]!]);
  return v;
}

export function prepare(flat: number[]): Prepared | null {
  const raw = toVecs(flat);
  if (raw.length < 3) return null;
  const length = polylineLength(raw);
  const box = bboxOf(raw);
  const diag = Math.hypot(box.w, box.h);
  if (length < 1e-6 || diag < 1e-6) return null;
  const gap = dist(raw[0]!, raw[raw.length - 1]!) / length;
  const closed = gap < config.closedGap;
  return {
    pts: resample(raw, 64),
    length,
    box,
    diag,
    gap,
    closed,
    closeFactor: 1 - 0.25 * Math.min(1, gap / config.closedGap) ** 2,
  };
}
