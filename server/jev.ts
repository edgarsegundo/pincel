/**
 * ÚNICO ponto do projeto que conhece o formato do JEV (TypeSafe AI System One).
 * Trocar de provedor = reescrever este arquivo.
 *
 * Formato (docs.typesafe.ai/api): POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer <chave>
 *   { model, state, questions: { <id>: { type: 'choice'|'noul'|'score', instructions, criteria? } } }
 *   -> { model, answers: { <id>: { choice, confidence, probabilities } | { noul } }, usage: { input_tokens } }
 */
import type { AiShape, ShapeRequest, ShapeVerdict } from './types.ts';

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

/** Modelo PINADO: um upgrade silencioso muda as notas sem aviso. Subir à mão depois de `npm run jev:calibrate`. */
export const DEFAULT_MODEL = 'jev-1.13.0';

/** Mude esta versão sempre que alterar os textos abaixo (as notas calibradas dependem deles). */
export const PROMPT_VERSION = 'shape-v3';

export const SHAPE_INSTRUCTIONS =
  'The state describes ONE hand-drawn stroke on a whiteboard, already measured. ' +
  "'stroke' has geometric features (closed, gap_ratio = distance start-to-end over path length, aspect_ratio, " +
  'bbox_fill = polygon area over bounding-box area, circularity = 4*pi*area/perimeter^2 (1 is a perfect circle), ' +
  'radius_cv = variation of the distance to the center, bend_count = bends of at least 35 degrees, corner_count = bends of at least 65 degrees, ' +
  'turning_angles_deg = the turn of every bend measured over a window of about 10% of the perimeter, self_intersections). ' +
  "'local_scores' are match scores from a rule-based recognizer (0 to 1). " +
  "'outline' is the simplified outline inside a 0..1 box. " +
  'Which basic shape was the person trying to draw?';

/** Opções = formas básicas que o JEV decide. Adicionar uma forma = nova entrada aqui + mapeamento em src/recognition/ai/shapes.ts. */
export const SHAPE_CRITERIA: Record<AiShape, Record<string, string> | null> = {
  circle: {
    means: 'a closed, smooth, round outline: a circle or an oval',
    typical: 'no real corners (every turn is small and even, about 30 to 55 degrees), circularity above 0.8, bbox_fill about 0.78, low radius_cv for a circle',
  },
  rectangle: {
    means: 'a closed outline with four right-angle corners: a rectangle or a square',
    typical: 'four turns of about 90 degrees, bbox_fill above 0.85, long straight sides parallel to the bounding box',
  },
  diamond: {
    means: 'a closed outline with four corners that point up, down, left and right: a diamond (rhombus), the decision symbol of a flowchart',
    typical: 'four bends of about 70 to 130 degrees (bend_count 4, even when corner_count is lower because of hand tremor), self_intersections 0, bbox_fill about 0.5 (between 0.4 and 0.58; a round outline has about 0.75 and is NOT a diamond), the corners sit near the middle of each side of the bounding box in the outline, sides are diagonal',
  },
  triangle: {
    means: 'a closed outline with exactly three corners',
    typical: 'three turns of about 100 to 150 degrees, bbox_fill about 0.5 (between 0.35 and 0.65)',
  },
  none: {
    means: 'not clearly any of the four: a pentagon or other polygon, a star, a heart, an arrow, a letter, a number, a spiral, a check mark, an open curve, a scribble or any other drawing',
    typical: 'open or messy outline, self_intersections above 1, an irregular mix of turns, or low scores everywhere',
  },
};

export const DELIBERATE_INSTRUCTIONS =
  'Was this stroke a deliberate attempt to draw a clean geometric shape (circle, oval, triangle, rectangle, square or diamond), ' +
  'as opposed to a handwritten letter or number, a doodle, a scribble, a spiral, a check mark, or a partial curve?';

export function buildJevRequest(input: ShapeRequest, model: string) {
  return {
    model,
    state: { stroke: input.features, local_scores: input.local_scores, outline: input.outline },
    questions: {
      shape: { type: 'choice', instructions: SHAPE_INSTRUCTIONS, criteria: SHAPE_CRITERIA },
      deliberate: { type: 'noul', instructions: DELIBERATE_INSTRUCTIONS },
    },
  };
}

const num01 = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/** Valida a resposta do JEV. Devolve null se qualquer parte inesperada (nunca confiar no formato de fora). */
export function parseJevResponse(body: any): ShapeVerdict | null {
  const shape = body?.answers?.shape;
  const deliberate = num01(body?.answers?.deliberate?.noul);
  const confidence = num01(shape?.confidence);
  if (!shape || confidence === null || deliberate === null) return null;
  if (!(shape.choice in SHAPE_CRITERIA)) return null;
  const probabilities: Record<string, number> = {};
  for (const k of Object.keys(SHAPE_CRITERIA)) {
    const p = num01(shape.probabilities?.[k]);
    if (p === null) return null;
    probabilities[k] = p;
  }
  return {
    shape: shape.choice,
    confidence,
    probabilities,
    deliberate,
    model: typeof body.model === 'string' ? body.model : 'unknown',
    input_tokens: typeof body.usage?.input_tokens === 'number' ? body.usage.input_tokens : undefined,
  };
}
