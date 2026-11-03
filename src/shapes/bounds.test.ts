import { expect, test } from 'vitest';
import type { Freehand } from '../core/types';
import { bounds, invalidateBounds } from '.';

test('invalidateBounds descarta caixas em cache', () => {
  const o: Freehand = { id: 'a', type: 'freehand', color: 'ink', size: 'm', seed: 1, createdAt: 0, points: [0, 0, 1, 10, 10, 1] };
  const first = bounds(o);
  expect(bounds(o)).toBe(first); // cache
  invalidateBounds();
  expect(bounds(o)).not.toBe(first);
  expect(bounds(o)).toEqual(first);
});
