import { del, get, set } from 'idb-keyval';
import type { TrainingStroke } from '../recognition/calibration';

/** Traços de treino, guardados só neste aparelho (IndexedDB). O formato do JSON é o mesmo da exportação. */
const KEY = 'pincel.training';
export const MAX_STROKES = 1000;
export const LABELS = ['rectangle', 'ellipse', 'triangle', 'diamond', 'line', 'none'] as const;

export const loadTraining = async (): Promise<TrainingStroke[]> => {
  try { return parse(await get(KEY)); } catch { return []; }
};
export const saveTraining = (s: TrainingStroke[]) => set(KEY, s).catch(() => {});
export const clearTraining = () => del(KEY).catch(() => {});

/** Aceita só o que tem o formato esperado (vale para o IndexedDB e para JSON importado). */
export function parse(raw: unknown): TrainingStroke[] {
  if (!Array.isArray(raw)) throw new Error('formato inválido');
  const out: TrainingStroke[] = [];
  for (const s of raw.slice(0, MAX_STROKES)) {
    if (!s || !(LABELS as readonly string[]).includes(s.label)) continue;
    const pts = s.points;
    if (!Array.isArray(pts) || pts.length < 3 || pts.length > 5000) continue;
    if (Array.isArray(pts[0])) { // [[x, y], ...] (formato exportado)
      if (!pts.every((p: unknown) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) continue;
      out.push({ label: s.label, points: pts.flatMap((p: number[]) => [p[0]!, p[1]!, 0.5]) });
    } else if (pts.length % 3 === 0 && pts.every(Number.isFinite)) {
      out.push({ label: s.label, points: pts });
    }
  }
  return out;
}

export const toExport = (s: TrainingStroke[]) =>
  s.map((x) => ({ label: x.label, points: Array.from({ length: x.points.length / 3 }, (_, i) => [x.points[i * 3]!, x.points[i * 3 + 1]!]) }));
