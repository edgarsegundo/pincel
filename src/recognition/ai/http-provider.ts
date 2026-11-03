import type { ShapeRequest, ShapeVerdict } from '../../../server/types';
import { config } from '../config';
import { AiError, type AiProvider } from './provider';

const SHAPES = new Set(['circle', 'triangle', 'rectangle', 'diamond', 'none']);
const unit = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;

/** Fala com o proxy do Pincel (a chave do JEV nunca chega aqui). */
export function httpProvider(endpoint: string): AiProvider {
  return {
    async classify(req: ShapeRequest, signal: AbortSignal): Promise<ShapeVerdict> {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), config.aiTimeoutMs);
      const onAbort = () => timeout.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(req),
          signal: timeout.signal,
        });
        if (res.status === 503) throw new AiError('not_configured');
        if (res.status === 500 || res.status === 400) throw new AiError('invalid', `HTTP ${res.status}`);
        if (!res.ok) throw new AiError('transient', `HTTP ${res.status}`);
        const v = (await res.json()) as ShapeVerdict;
        if (!SHAPES.has(v?.shape) || !unit(v.confidence) || !unit(v.deliberate)) throw new AiError('transient', 'resposta inesperada');
        return v;
      } catch (e) {
        if (e instanceof AiError) throw e;
        throw new AiError(signal.aborted ? 'aborted' : 'transient', String(e));
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
    },
  };
}
