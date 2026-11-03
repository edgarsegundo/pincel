import type { ShapeRequest, ShapeVerdict } from '../../../server/types';

/** 'not_configured'/'invalid' são determinísticos (a IA desliga na sessão); 'transient' pode passar. */
export class AiError extends Error {
  constructor(readonly kind: 'not_configured' | 'invalid' | 'transient' | 'aborted', message?: string) {
    super(message ?? kind);
  }
}

/** Fonte de decisões da IA. Trocar o JEV por outro serviço = outra implementação desta interface. */
export interface AiProvider {
  classify(req: ShapeRequest, signal: AbortSignal): Promise<ShapeVerdict>;
}
