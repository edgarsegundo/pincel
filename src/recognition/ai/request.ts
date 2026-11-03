import type { LocalScores, ShapeRequest } from '../../../server/types';
import { matchers } from '../../shapes';
import { config } from '../config';
import { buildShapeRequest } from '../features';
import { prepare } from '../prepare';

/**
 * O traço vale a pergunta à IA? Só os quase fechados e com tamanho plausível (letras abertas,
 * rabiscos e linhas nem saem do navegador). Devolve o pedido já montado, ou null.
 */
export function prepareAiRequest(points: number[]): ShapeRequest | null {
  const s = prepare(points);
  if (!s || s.gap >= config.aiMaxGap) return null;
  if (Math.min(s.box.w, s.box.h) < 0.1 * Math.max(s.box.w, s.box.h)) return null;

  // Notas honestas de cada forma (ajuste forçado), para o JEV pesar a evidência local.
  const local: LocalScores = {};
  for (const d of matchers) {
    const c = (d.fit ? d.fit(s) : d.match!(s))?.confidence ?? 0;
    local[d.type as keyof LocalScores] = c;
  }
  return buildShapeRequest(s, local);
}
