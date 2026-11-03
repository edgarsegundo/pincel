import { settings } from '../settings/settings';
import { en } from './en';
import { ptBR, type Dict } from './pt-BR';

export type Key = keyof Dict;
const dicts: Record<string, Record<Key, string>> = { 'pt-BR': ptBR, en };

/** Texto da interface no idioma atual (cai para pt-BR). Nenhum texto fixo nos componentes. */
export const t = (key: Key): string => (dicts[settings.getState().language] ?? ptBR)[key] ?? ptBR[key];
