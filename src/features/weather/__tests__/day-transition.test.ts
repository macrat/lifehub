import { describe, expect, it } from 'vitest';
import { dateStringSchema } from '../../../../shared/validation/common.ts';
import { dayTransitionName, HOME_WEATHER_TRANSITION } from '../day-transition.ts';

const date = (s: string) => dateStringSchema.parse(s);

describe('dayTransitionName', () => {
  it('ホームのタイルに出ている日の行だけに、タイルと同じ名前を付ける', () => {
    const home = date('2026-09-27');
    expect(dayTransitionName(date('2026-09-27'), home)).toBe(HOME_WEATHER_TRANSITION);
    expect(dayTransitionName(date('2026-09-28'), home)).toBeUndefined();
  });
});
