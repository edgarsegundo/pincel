import type { ShapeRequest, ShapeVerdict } from '../../../server/types';
import type { Vec2 } from '../../core/types';
import { config } from '../config';
import { AiError, type AiProvider } from './provider';

export interface AiJob {
  id: string; // um pedido por traço
  request: ShapeRequest;
  /** Ponto (espaço do quadro) onde mostrar o indicador "analisando". */
  anchor: Vec2;
  /** O traço continua como estava quando perguntamos? Se não, a resposta é descartada. */
  isIntact: () => boolean;
}

export interface CoordinatorOptions {
  provider: () => AiProvider | null;
  enabled: () => boolean;
  now?: () => number;
  /** Avisa que o conjunto de pendências mudou (para redesenhar o indicador). */
  onChange?: () => void;
}

interface Pending { anchor: Vec2; t0: number; ctrl: AbortController }

/**
 * Pergunta à IA em segundo plano sem nunca atrapalhar o desenho: no máximo N pedidos simultâneos,
 * um por traço, cancelamento quando o traço muda, descarte silencioso de resposta obsoleta e
 * disjuntor que pausa a IA depois de falhas seguidas. `ask` NUNCA rejeita: resolve null.
 */
export class AiCoordinator {
  /** Pedidos em andamento (lido pelo renderizador para o indicador). */
  readonly pending = new Map<string, { x: number; y: number; t0: number }>();
  private active = new Map<string, Pending & { job: AiJob; promise: Promise<ShapeVerdict | null> }>();
  private queue: Array<() => void> = [];
  private running = 0;
  private failures = 0;
  private pausedUntil = 0;
  private disabled = false; // not_configured / invalid: não insiste na sessão
  private readonly now: () => number;
  onChange?: () => void;

  constructor(private opts: CoordinatorOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.onChange = opts.onChange;
  }

  get available() {
    return !this.disabled && this.opts.enabled() && !!this.opts.provider() && this.now() >= this.pausedUntil;
  }

  ask(job: AiJob): Promise<ShapeVerdict | null> {
    const existing = this.active.get(job.id);
    if (existing) return existing.promise;
    if (!this.available) return Promise.resolve(null);

    const ctrl = new AbortController();
    const promise = new Promise<ShapeVerdict | null>((resolve) => {
      const run = async () => {
        this.running++;
        try {
          if (ctrl.signal.aborted || !job.isIntact()) return resolve(null);
          const verdict = await this.opts.provider()!.classify(job.request, ctrl.signal);
          this.failures = 0;
          // Resposta atrasada que já não se aplica é descartada em silêncio.
          resolve(ctrl.signal.aborted || !job.isIntact() ? null : verdict);
        } catch (e) {
          if (e instanceof AiError) this.onFailure(e);
          resolve(null);
        } finally {
          this.running--;
          this.active.delete(job.id);
          this.pending.delete(job.id);
          this.onChange?.();
          this.queue.shift()?.();
        }
      };
      if (this.running < config.aiMaxConcurrent) void run();
      else this.queue.push(() => void run());
    });
    this.active.set(job.id, { anchor: job.anchor, t0: this.now(), ctrl, job, promise });
    this.pending.set(job.id, { x: job.anchor[0], y: job.anchor[1], t0: performance.now() });
    this.onChange?.();
    return promise;
  }

  /** Cancela pedidos cujo traço mudou (apagado, movido, desfeito). Chamado a cada mudança do quadro. */
  abortStale() {
    for (const a of this.active.values()) if (!a.job.isIntact()) a.ctrl.abort();
  }

  private onFailure(e: AiError) {
    if (e.kind === 'aborted') return;
    if (e.kind === 'not_configured' || e.kind === 'invalid') { this.disabled = true; return; }
    if (++this.failures >= config.aiBreakerFailures) {
      this.pausedUntil = this.now() + config.aiBreakerPauseMs;
      this.failures = 0;
    }
  }
}
