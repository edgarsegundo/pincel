import { rng, sample, trace, type Label } from '../synthetic';
import type { Vec2 } from '../../core/types';

/** Conjunto rotulado para testar/calibrar a IA: formas com tremor (ambíguas) e fechados que NÃO são círculo/triângulo/retângulo. */
export type AiLabel = 'circle' | 'rectangle' | 'triangle' | 'none';
export interface Item { label: AiLabel; kind: string; points: number[] }

/** Soma tremor suave extra (fração da diagonal), deixando o traço mais "à mão" e ambíguo. */
function shake(points: number[], amp: number, seed: number) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 3) { minX = Math.min(minX, points[i]!); maxX = Math.max(maxX, points[i]!); minY = Math.min(minY, points[i + 1]!); maxY = Math.max(maxY, points[i + 1]!); }
  const a = amp * Math.hypot(maxX - minX, maxY - minY);
  return points.map((v, i) => (i % 3 === 2 ? v : v + Math.sin((i / 3) * (0.35 + (seed % 5) * 0.07) + seed) * a));
}

const star = (cx: number, cy: number, r: number): Vec2[] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as Vec2;
  });

const eight = (cx: number, cy: number, r: number): Vec2[] =>
  Array.from({ length: 120 }, (_, i) => {
    const t = (i / 120) * Math.PI * 2;
    return [cx + r * Math.sin(t), cy + r * 0.5 * Math.sin(2 * t)] as Vec2;
  });

/** Tremor extra como fração da diagonal: ~0,6% a 2,2% (a mão que já derrota o reconhecedor local está em ~2%). */
export const SHAKE = [0.006, 0.014, 0.022];

export function buildDataset(perClass = 30, seed = 21): Item[] {
  const r = rng(seed);
  const out: Item[] = [];
  const add = (label: AiLabel, kind: string, pts: number[]) => out.push({ label, kind, points: pts });
  const pos: [Label, AiLabel][] = [['ellipse', 'circle'], ['rectangle', 'rectangle'], ['triangle', 'triangle']];
  for (const [src, label] of pos) for (let i = 0; i < perClass; i++) add(label, src, shake(sample(src, r), SHAKE[i % 3]!, i));
  for (let i = 0; i < perClass; i++) {
    const x = r() * 300, y = r() * 300, s = 80 + r() * 200;
    const k = i % 3;
    if (k === 0) add('none', 'diamond', shake(sample('diamond', r), 0.015, i));
    else if (k === 1) add('none', 'star', trace(star(x, y, s), true, r, { wobble: 0.015 }));
    else add('none', 'eight', trace(eight(x, y, s), true, r, { wobble: 0.01, overshoot: 0.02 }));
  }
  return out;
}
