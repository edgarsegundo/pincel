/** Contrato entre o app (navegador) e o proxy do JEV. Só tipos: seguro de importar dos dois lados. */

/** Características geométricas do traço, calculadas no navegador. Tudo normalizado (sem unidades de tela). */
export interface StrokeFeatures {
  closed: boolean;
  gap_ratio: number; // distância início–fim / comprimento do traço
  aspect_ratio: number; // lado maior / lado menor da caixa (≥ 1)
  bbox_fill: number; // área do contorno / área da caixa
  circularity: number; // 4πA/P² (1 = círculo perfeito)
  radius_cv: number; // variação da distância ao centro (0 = círculo perfeito)
  bend_count: number; // curvas do contorno com virada ≥ 35° (medida numa janela de ~10% do perímetro)
  corner_count: number; // curvas com virada ≥ 65° (cantos)
  turning_angles_deg: number[]; // virada de cada curva, em graus, na ordem do traço
  self_intersections: number;
}

export type LocalScores = Partial<Record<'line' | 'rectangle' | 'diamond' | 'ellipse' | 'triangle', number>>;

export interface ShapeRequest {
  v: 1;
  features: StrokeFeatures;
  local_scores: LocalScores;
  /** Contorno simplificado, em [0..1] (escala uniforme, lado maior = 1). Até 16 pontos. */
  outline: [number, number][];
}

export type AiShape = 'circle' | 'triangle' | 'rectangle' | 'none';

export interface ShapeVerdict {
  shape: AiShape;
  confidence: number; // 0..1, concentração da distribuição (Choice)
  probabilities: Record<string, number>;
  deliberate: number; // 0..1, probabilidade de ser uma forma proposital
  model: string;
  input_tokens?: number;
}

export type ProxyError = 'not_configured' | 'rate_limited' | 'bad_request' | 'upstream' | 'upstream_invalid';
