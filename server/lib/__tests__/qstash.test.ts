import { describe, expect, it } from 'vitest';
import { deduplicationIdOf } from '../qstash.ts';

describe('deduplicationIdOf', () => {
  const key = 'event:01a0ce6f-21f3-72cc-9d6f-ce9b9b2d7eff:single:start:2026-09-23T13:30:00.000Z';

  it('QStash が受け付ける文字だけにする（":" を含まない）', () => {
    expect(deduplicationIdOf(key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('同じキーからは同じ ID、違うキーからは違う ID になる', () => {
    expect(deduplicationIdOf(key)).toBe(deduplicationIdOf(key));
    expect(deduplicationIdOf(key)).not.toBe(deduplicationIdOf(`${key}:user`));
  });
});
