import { expect, test } from 'vitest';
import type { Freehand } from '../core/types';
import { pickAt, translate } from '.';

const line: Freehand = { id: 'a', type: 'freehand', color: 'ink', size: 'm', seed: 1, createdAt: 0, points: [0, 0, 0.5, 100, 0, 0.5] };

test('hit-test acerta perto do traço e erra longe', () => {
  expect(pickAt([line], [50, 2], 4)?.id).toBe('a');
  expect(pickAt([line], [50, 40], 4)).toBeUndefined();
});

test('translate move todos os pontos sem mutar o original', () => {
  const moved = translate(line, [10, 5]) as Freehand;
  expect(moved.points.slice(0, 2)).toEqual([10, 5]);
  expect(line.points[0]).toBe(0);
});
