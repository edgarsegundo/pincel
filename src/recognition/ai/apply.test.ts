import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { shapeFromVerdict } = await import('./apply');
const { prepareAiRequest } = await import('./request');
const { rng, sample } = await import('../synthetic');
import type { Freehand } from '../../core/types';
import type { ShapeVerdict } from '../../../server/types';

const stroke = (label: Parameters<typeof sample>[0], seed = 5): Freehand => ({
  id: 's', type: 'freehand', color: 'ink', size: 'm', seed: 1, createdAt: 0, points: sample(label, rng(seed)),
});
const ctx = { others: [], zoom: 1 };
const v = (over: Partial<ShapeVerdict> = {}): ShapeVerdict => ({ shape: 'rectangle', confidence: 0.9, deliberate: 0.9, probabilities: {}, model: 'm', ...over });

test('veredito confiante e traço compatível: vira a forma, marcada como vinda da IA', () => {
  const shape = shapeFromVerdict(stroke('rectangle'), v(), ctx, 'release')!;
  expect(shape.type).toBe('rectangle');
  expect(shape.recognizedFrom).toMatchObject({ source: 'ai', confidence: 0.9, trigger: 'release' });
  expect(shape.id).toBe('s'); // mesmo id: desfazer restaura o traço
});

test('"circle" vira elipse com a geometria calculada localmente', () => {
  const shape = shapeFromVerdict(stroke('ellipse'), v({ shape: 'circle' }), ctx, 'hold')!;
  expect(shape.type).toBe('ellipse');
  expect(shape.recognizedFrom?.trigger).toBe('hold');
});

test('confiança baixa, pouca "intenção" ou "none": mantém o traço livre', () => {
  const s = stroke('rectangle');
  expect(shapeFromVerdict(s, v({ confidence: 0.5 }), ctx, 'release')).toBeNull();
  expect(shapeFromVerdict(s, v({ deliberate: 0.3 }), ctx, 'release')).toBeNull();
  expect(shapeFromVerdict(s, v({ shape: 'none' }), ctx, 'release')).toBeNull();
});

test('a IA não força geometria absurda: um triângulo não vira "círculo"', () => {
  expect(shapeFromVerdict(stroke('triangle'), v({ shape: 'circle' }), ctx, 'release')).toBeNull();
});

test('só vale perguntar à IA para traços quase fechados e plausíveis', () => {
  expect(prepareAiRequest(stroke('rectangle').points)).not.toBeNull();
  expect(prepareAiRequest(stroke('line').points)).toBeNull(); // aberto
  const req = prepareAiRequest(stroke('triangle').points)!;
  expect(Object.keys(req.local_scores).sort()).toEqual(['diamond', 'ellipse', 'line', 'rectangle', 'triangle']);
  expect(req.local_scores.triangle!).toBeGreaterThan(req.local_scores.ellipse!);
});
