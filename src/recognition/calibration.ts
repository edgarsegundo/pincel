import { config } from './config';
import { releaseCandidate } from './decide';

/**
 * Calibração local: a partir de traços rotulados pelo próprio usuário, escolhe o limiar de
 * soltura de cada forma. Roda no aparelho; nada sai dele. O resultado é o ponto de partida do
 * aprendizado contínuo (learning.ts).
 */
export interface TrainingStroke { label: string; points: number[] } // points = x, y, pressão (3 por ponto)

export interface Evaluation {
  recall: number; // formas desenhadas que viraram a forma certa
  falsePositive: number; // traços "none" que viraram forma
  wrongType: number; // formas que viraram outra forma
}
export interface CalibrationResult {
  ready: boolean;
  reason?: 'few-none' | 'few-shapes';
  thresholds: Record<string, number>;
  before: Evaluation;
  after: Evaluation;
}

export const MIN_NONE = 20;
export const MIN_PER_SHAPE = 5;
const MAX_FP_RATE = 0.03; // meta: ≤ 3% de conversões indevidas
const FLOOR_DELTA = 0.1; // mesmo piso do aprendizado contínuo
const CEIL = 0.97;

type Item = { label: string; c: { type: string; confidence: number } | null };

function evaluate(items: Item[], th: (type: string) => number): Evaluation {
  const accepted = (i: Item) => (i.c && i.c.confidence >= th(i.c.type) ? i.c.type : null);
  let shapes = 0, hit = 0, wrong = 0, nones = 0, fp = 0;
  for (const i of items) {
    const got = accepted(i);
    if (i.label === 'none') { nones++; if (got) fp++; }
    else { shapes++; if (got === i.label) hit++; else if (got) wrong++; }
  }
  return { recall: shapes ? hit / shapes : 0, falsePositive: nones ? fp / nones : 0, wrongType: shapes ? wrong / shapes : 0 };
}

export function countByLabel(strokes: TrainingStroke[]): Record<string, number> {
  const n: Record<string, number> = {};
  for (const s of strokes) n[s.label] = (n[s.label] ?? 0) + 1;
  return n;
}

export function calibrate(strokes: TrainingStroke[]): CalibrationResult {
  const items: Item[] = strokes.map((s) => ({ label: s.label, c: releaseCandidate(s.points) }));
  const base = config.releaseThreshold;
  const counts = countByLabel(strokes);
  const types = Object.keys(counts).filter((l) => l !== 'none' && counts[l]! >= MIN_PER_SHAPE);

  const thresholds: Record<string, number> = {};
  for (const type of types) {
    const negatives = items.filter((i) => i.label !== type);
    const allowed = Math.floor(negatives.length * MAX_FP_RATE);
    let chosen = CEIL;
    // do mais permissivo ao mais rígido: o primeiro que respeita o limite de conversões indevidas
    for (let th = base - FLOOR_DELTA; th <= CEIL + 1e-9; th += 0.01) {
      const fp = negatives.filter((i) => i.c?.type === type && i.c.confidence >= th).length;
      if (fp <= allowed) { chosen = Math.round(th * 100) / 100; break; }
    }
    thresholds[type] = chosen;
  }

  const before = evaluate(items, () => base);
  const after = evaluate(items, (type) => thresholds[type] ?? base);
  const reason = (counts.none ?? 0) < MIN_NONE ? 'few-none' : types.length === 0 ? 'few-shapes' : undefined;
  return { ready: !reason, reason, thresholds, before, after };
}
