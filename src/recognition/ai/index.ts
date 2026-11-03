import { store } from '../../core/store';
import { settings } from '../../settings/settings';
import { AiCoordinator } from './coordinator';
import { httpProvider } from './http-provider';
import type { AiProvider } from './provider';

/** Em desenvolvimento o proxy roda dentro do Vite (/api/shape). Em produção, defina VITE_AI_ENDPOINT. */
const ENDPOINT: string = import.meta.env.VITE_AI_ENDPOINT ?? (import.meta.env.DEV ? '/api/shape' : '');

let provider: AiProvider | null = ENDPOINT ? httpProvider(ENDPOINT) : null;
export const setAiProvider = (p: AiProvider | null) => { provider = p; };

export const ai = new AiCoordinator({ provider: () => provider, enabled: () => settings.getState().aiAssist });
store.subscribe(() => ai.abortStale());
