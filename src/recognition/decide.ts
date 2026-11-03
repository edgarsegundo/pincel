import { matchers } from '../shapes';
import { config } from './config';
import { releaseThreshold } from './learning';
import { prepare, type Prepared } from './prepare';

export type Trigger = 'release' | 'hold';
export interface Recognition { type: string; confidence: number; geometry: Record<string, unknown> }

interface Ranked { type: string; m: NonNullable<ReturnType<NonNullable<(typeof matchers)[number]['match']>>> }

const rank = (prepared: Prepared): Ranked[] =>
  matchers
    .map((d) => ({ type: d.type, m: d.match!(prepared) }))
    .filter((c): c is Ranked => !!c.m)
    .sort((a, b) => b.m.confidence - a.m.confidence);

/** Ao soltar, duas formas quase empatadas deixam o traço livre (a IA, se ligada, desempata). */
const ambiguous = (c: Ranked[]) => !!c[1] && c[1].m.confidence >= 0.5 && c[0]!.m.confidence - c[1].m.confidence < config.ambiguityGap;

/** Melhor forma ao soltar e sua confiança, sem aplicar limiares (usado pela calibração). */
export function releaseCandidate(points: number[]): { type: string; confidence: number } | null {
  const prepared = prepare(points);
  const c = prepared ? rank(prepared) : [];
  return c[0] && !ambiguous(c) ? { type: c[0].type, confidence: c[0].m.confidence } : null;
}

/** Classifica o traço. A geometria final é sempre calculada aqui, nunca por IA. */
export function recognize(points: number[], trigger: Trigger): Recognition | null {
  const prepared = prepare(points);
  if (!prepared) return null;

  const candidates = rank(prepared);
  const best = candidates[0];
  if (!best) return null;
  const threshold = trigger === 'release' ? releaseThreshold(best.type) : config.holdThreshold;
  if (best.m.confidence < threshold) return null;

  if (trigger === 'release' && ambiguous(candidates)) return null; // ambíguo: fica livre (ou vai ao JEV)
  return { type: best.type, confidence: best.m.confidence, geometry: best.m.build() };
}
