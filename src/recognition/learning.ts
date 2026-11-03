import { hooks } from '../core/store';
import { settings } from '../settings/settings';
import { config } from './config';

// Aprendizado local: desfazer uma conversão sobe o limiar daquele tipo; forçar uma desce.
const KEY = 'pincel.learned';
let learned: Record<string, number> = {};
try { learned = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { /* sem storage */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(learned)); } catch { /* ignora */ } };

export const releaseThreshold = (type: string) => (settings.getState().learning ? learned[type] : undefined) ?? config.releaseThreshold;

export function noteConversionUndone(type: string) {
  if (!settings.getState().learning) return;
  learned[type] = Math.min(0.97, (learned[type] ?? config.releaseThreshold) + 0.02);
  save();
}

export function noteHoldConversion(type: string, confidence: number) {
  if (!settings.getState().learning) return;
  if (confidence >= releaseThreshold(type)) return;
  learned[type] = Math.max(config.releaseThreshold - 0.1, (learned[type] ?? config.releaseThreshold) - 0.01);
  save();
}

export function resetLearning() { learned = {}; save(); }

hooks.onConversionUndone = (o) => {
  if (o.recognizedFrom?.source === 'ai') return; // os limiares locais só aprendem com conversões locais
  noteConversionUndone(o.type);
};
