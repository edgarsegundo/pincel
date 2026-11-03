import type { AiShape } from '../../../server/types';

/** Opção da IA → tipo de forma do app. Adicionar uma forma à IA = nova linha aqui + critério em server/jev.ts. */
export const AI_TO_TYPE: Record<AiShape, string | null> = {
  circle: 'ellipse', // o JEV decide "círculo/oval"; o ajuste local define os raios
  triangle: 'triangle',
  rectangle: 'rectangle',
  none: null,
};
