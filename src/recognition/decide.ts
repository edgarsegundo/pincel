import { matchers } from '../shapes';
import { config } from './config';
import { releaseThreshold } from './learning';
import { prepare } from './prepare';

export type Trigger = 'release' | 'hold';
export interface Recognition { type: string; confidence: number; geometry: Record<string, unknown> }

/** Classifica o traço. A geometria final é sempre calculada aqui, nunca por IA. */
export function recognize(points: number[], trigger: Trigger): Recognition | null {
  const prepared = prepare(points);
  if (!prepared) return null;

  const candidates = matchers
    .map((d) => ({ type: d.type, m: d.match!(prepared) }))
    .filter((c): c is { type: string; m: NonNullable<typeof c.m> } => !!c.m)
    .sort((a, b) => b.m.confidence - a.m.confidence);

  const best = candidates[0];
  if (!best) return null;
  const threshold = trigger === 'release' ? releaseThreshold(best.type) : config.holdThreshold;
  if (best.m.confidence < threshold) return null;

  const second = candidates[1];
  if (trigger === 'release' && second && second.m.confidence >= 0.5 && best.m.confidence - second.m.confidence < config.ambiguityGap) {
    return null; // ambíguo: na v1 fica livre (na v2 vai ao JEV)
  }
  return { type: best.type, confidence: best.m.confidence, geometry: best.m.build() };
}
