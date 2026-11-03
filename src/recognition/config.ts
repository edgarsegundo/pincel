/** Pontos de partida; calibrar com o conjunto de traços (dev/stroke-recorder.html). */
import { settings } from '../settings/settings';

export const config = {
  // valores ajustáveis pelo usuário vêm das configurações
  get holdMs() { return settings.getState().holdMs; },
  get releaseThreshold() { return settings.getState().releaseThreshold; },
  get holdThreshold() { return settings.getState().holdThreshold; },
  get morphMs() { return settings.getState().morphMs; },
  get aiThreshold() { return settings.getState().aiThreshold; },
  holdMovePx: 3,
  // IA (JEV): só traços quase fechados e plausíveis são enviados; a resposta é verificada localmente.
  aiMaxGap: 0.22, // lacuna máxima início–fim / comprimento para valer a pena perguntar
  aiDeliberate: 0.6, // nota mínima de "foi uma forma proposital?"
  aiMinFit: 0.3, // encaixe local mínimo no tipo que a IA escolheu (a IA não força geometria absurda)
  aiTimeoutMs: 3000,
  aiMaxConcurrent: 2,
  aiBreakerFailures: 3, // falhas seguidas que pausam a IA
  aiBreakerPauseMs: 60_000,
  aiIndicatorDelayMs: 200, // só mostra o ponto "analisando" se demorar
  minSizePx: 24,
  cadenceMs: 600,
  cadenceRadiusPx: 60,
  ambiguityGap: 0.1,
  closedGap: 0.1, // distância início–fim / comprimento
  beautify: { angleDeg: 6, squareRatio: 0.1, alignPx: 8, sizeMatch: 0.06, neighborPx: 200 },
};
