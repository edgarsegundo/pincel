/**
 * Esquema declarativo das configurações. Daqui saem os padrões, a validação e o painel.
 * Nova configuração = nova entrada aqui (+ chaves de texto em i18n/).
 */
export interface Settings {
  autoStraighten: boolean;
  scribbleErase: boolean;
  connectors: boolean;
  learning: boolean;
  aiAssist: boolean;
  aiThreshold: number;
  snapAngle: boolean;
  snapProportion: boolean;
  snapSize: boolean;
  snapAlign: boolean;
  grid: boolean;
  theme: 'auto' | 'light' | 'dark';
  language: 'pt-BR' | 'en';
  shapeStyle: 'rough' | 'clean';
  holdMs: number;
  releaseThreshold: number;
  holdThreshold: number;
  morphMs: number;
  roughness: number;
}

type Base<K extends keyof Settings> = { key: K; group: 'basic' | 'advanced' };
export type Field =
  | (Base<keyof Settings> & { kind: 'toggle' })
  | (Base<keyof Settings> & { kind: 'select'; options: string[] })
  | (Base<keyof Settings> & { kind: 'range'; min: number; max: number; step: number });

const detectLanguage = (): Settings['language'] =>
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'pt-BR';

export const defaults = (): Settings => ({
  autoStraighten: true,
  scribbleErase: true,
  connectors: true,
  learning: true,
  aiAssist: true,
  aiThreshold: 0.7,
  snapAngle: true,
  snapProportion: true,
  snapSize: true,
  snapAlign: true,
  grid: true,
  theme: 'auto',
  language: detectLanguage(),
  shapeStyle: 'rough',
  holdMs: 400,
  releaseThreshold: 0.9,
  holdThreshold: 0.6,
  morphMs: 180,
  roughness: 1,
});

export const schema: Field[] = [
  { key: 'language', kind: 'select', options: ['pt-BR', 'en'], group: 'basic' },
  { key: 'theme', kind: 'select', options: ['auto', 'light', 'dark'], group: 'basic' },
  { key: 'grid', kind: 'toggle', group: 'basic' },
  { key: 'shapeStyle', kind: 'select', options: ['rough', 'clean'], group: 'basic' },
  { key: 'autoStraighten', kind: 'toggle', group: 'basic' },
  { key: 'scribbleErase', kind: 'toggle', group: 'basic' },
  { key: 'connectors', kind: 'toggle', group: 'basic' },
  { key: 'learning', kind: 'toggle', group: 'basic' },
  { key: 'aiAssist', kind: 'toggle', group: 'basic' },
  { key: 'snapAngle', kind: 'toggle', group: 'basic' },
  { key: 'snapProportion', kind: 'toggle', group: 'basic' },
  { key: 'snapSize', kind: 'toggle', group: 'basic' },
  { key: 'snapAlign', kind: 'toggle', group: 'basic' },
  { key: 'holdMs', kind: 'range', min: 200, max: 800, step: 50, group: 'advanced' },
  { key: 'releaseThreshold', kind: 'range', min: 0.7, max: 1, step: 0.01, group: 'advanced' },
  { key: 'holdThreshold', kind: 'range', min: 0.3, max: 0.9, step: 0.01, group: 'advanced' },
  { key: 'morphMs', kind: 'range', min: 0, max: 400, step: 10, group: 'advanced' },
  { key: 'aiThreshold', kind: 'range', min: 0.5, max: 0.99, step: 0.01, group: 'advanced' },
  { key: 'roughness', kind: 'range', min: 0, max: 3, step: 0.1, group: 'advanced' },
];

/** Valida um valor salvo contra o esquema; devolve o padrão se inválido. */
export function sanitize(raw: unknown): Settings {
  const out: any = defaults();
  if (!raw || typeof raw !== 'object') return out;
  for (const f of schema) {
    const v = (raw as any)[f.key];
    if (f.kind === 'toggle' && typeof v === 'boolean') out[f.key] = v;
    else if (f.kind === 'select' && f.options.includes(v)) out[f.key] = v;
    else if (f.kind === 'range' && typeof v === 'number' && v >= f.min && v <= f.max) out[f.key] = v;
  }
  return out;
}
