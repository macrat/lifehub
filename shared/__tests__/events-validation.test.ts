import { describe, expect, it } from 'vitest';
import { createEventSchema } from '../validation/events.ts';

const base = {
  kind: 'event',
  title: '旅行',
  allDay: true,
  startsAt: '2026-09-16T00:00:00+09:00',
  endsAt: '2026-09-16T00:00:00+09:00',
  participantIds: ['01a0cd0f-b09f-7200-a03b-88ad412b0dca'],
};

describe('createEventSchema', () => {
  it('終日の通知は当日（0）か前日（1440）だけを受け付ける', () => {
    expect(createEventSchema.safeParse({ ...base, remindStartMinutes: 0 }).success).toBe(true);
    expect(createEventSchema.safeParse({ ...base, remindStartMinutes: 1440 }).success).toBe(true);
    expect(createEventSchema.safeParse({ ...base, remindStartMinutes: 30 }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, remindEndMinutes: 60 }).success).toBe(false);
    // 時刻のある項目は n 分前をそのまま使う
    expect(
      createEventSchema.safeParse({ ...base, allDay: false, remindStartMinutes: 30 }).success,
    ).toBe(true);
  });
});
