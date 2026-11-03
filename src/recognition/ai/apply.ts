import type { ShapeVerdict } from '../../../server/types';
import type { Freehand, Shape } from '../../core/types';
import type { BeautifyCtx } from '../beautify';
import type { Trigger } from '../decide';
import { config } from '../config';
import { convertAs } from '../convert';
import { AI_TO_TYPE } from './shapes';

/**
 * A IA propõe a INTENÇÃO; a geometria final é sempre calculada localmente e conferida:
 * confiança do Choice, nota de "forma proposital" e encaixe local mínimo no tipo escolhido.
 */
export function shapeFromVerdict(stroke: Freehand, v: ShapeVerdict, ctx: BeautifyCtx, trigger: Trigger): Shape | null {
  const type = AI_TO_TYPE[v.shape];
  if (!type) return null;
  if (v.confidence < config.aiThreshold || v.deliberate < config.aiDeliberate) return null;
  return convertAs(stroke, type, { source: 'ai', confidence: v.confidence }, ctx, config.aiMinFit, trigger);
}
