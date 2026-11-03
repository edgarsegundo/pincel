/** Limiares calibrados pelo usuário, guardados no aparelho (os traços de treino ficam em ui/training-data.ts). */
const KEY = 'pincel.calibration';
let applied: Record<string, number> = {};
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  for (const [k, v] of Object.entries(saved)) if (typeof v === 'number' && v >= 0.5 && v <= 1) applied[k] = v;
} catch { /* sem storage */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(applied)); } catch { /* ignora */ } };

/** Limiar de soltura calibrado para o tipo (ou undefined se o usuário nunca calibrou). */
export const calibratedThreshold = (type: string): number | undefined => applied[type];
export const isCalibrated = () => Object.keys(applied).length > 0;

export function applyCalibration(thresholds: Record<string, number>) { applied = { ...thresholds }; save(); }
export function resetCalibration() { applied = {}; save(); }
