import { describe, expect, it } from 'vitest';
import { homeWeatherDay } from '../queries.ts';

describe('homeWeatherDay', () => {
  it('18 時（JST）までは今日、18 時からは明日', () => {
    expect(homeWeatherDay(new Date('2030-05-10T17:59:59+09:00'))).toEqual({
      date: '2030-05-10',
      label: '今日',
    });
    expect(homeWeatherDay(new Date('2030-05-10T18:00:00+09:00'))).toEqual({
      date: '2030-05-11',
      label: '明日',
    });
  });

  it('日付は JST で決める（UTC ではまだ前の日の朝）', () => {
    expect(homeWeatherDay(new Date('2030-05-09T15:30:00Z'))).toEqual({
      date: '2030-05-10',
      label: '今日',
    });
  });
});
