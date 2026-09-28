import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateString } from '../../../../shared/types.ts';
import { clearTables } from '../../../lib/db/test-db.ts';
import { refreshHolidays } from '../../holidays/service.ts';
import { listWeatherPage, refreshWeather } from '../service.ts';
import { forecast, hourly, serve } from './service-fixtures.ts';

/** 天気の画面のページ（`listWeatherPage`）。日ごとの天気に祝日の印、3 時間ごとの天気、6 時間ごとの降水確率を添える */
describe('weather service: 天気の画面のページ', () => {
  beforeEach(async () => {
    await clearTables();
    serve({
      forecast: forecast(['302', '202', '200'], ['202', '200', '101']),
      hourly: hourly('2026-09-24T18:00:00+09:00', ['くもり', '雨']),
    });
    await refreshWeather();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('最新のページは今日の 1 週間前から週間予報の終わりまでで、日ごとに 3 時間ごとの天気と降水確率を添える', async () => {
    // 2026-09-24 12:00 JST。9/17〜10/1 のうち、取ってある 23〜26 日
    const page = await listWeatherPage(undefined, new Date('2026-09-24T03:00:00Z'));
    expect(page.items.map((d) => d.date)).toEqual([
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
    const [day23, day24] = page.items;
    // 3 時間ごとの天気は同じ天気が続いてもまとめず、枠ごとにその時刻の気温を持つ
    expect(day24?.slots).toEqual([
      { startMin: 1080, symbol: 'cloud', label: 'くもり', temp: 20 },
      { startMin: 1260, symbol: 'rain', label: '雨', temp: 21 },
    ]);
    // 降水確率は短期予報の 6 時間ごとの区間（23 日 18 時・24 日 0 時・6 時）
    expect(day23?.pops).toEqual([{ startMin: 1080, pop: 70 }]);
    expect(day24?.pops).toEqual([
      { startMin: 0, pop: 10 },
      { startMin: 360, pop: 30 },
    ]);
    expect(page.items[2]?.slots).toEqual([]);
    // 取り始めた日（23 日）より前は無い
    expect(page.nextCursor).toBeNull();
  });

  it('前に取っておいた日があれば、続きのページで 2 週間ずつ遡る', async () => {
    // 2026-10-05 12:00 JST。最新のページ（9/28〜）には取ってある日が無く、それより前にある
    const latest = await listWeatherPage(undefined, new Date('2026-10-05T03:00:00Z'));
    expect(latest).toEqual({ items: [], nextCursor: '2026-09-28' });
    const earlier = await listWeatherPage('2026-09-28' as DateString);
    expect(earlier.items.map((d) => d.date)).toEqual([
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
    expect(earlier.nextCursor).toBeNull();
  });

  it('気温の載っていない報では、前の報の気温を残す', async () => {
    // 前の報（beforeEach）は 18 時くもり 20 度、21 時雨 21 度。次の報は 18 時が雨で、気温が載っていない
    serve({
      forecast: forecast(['302', '202', '200'], ['202', '200', '101']),
      hourly: { areaTimeSeries: hourly('2026-09-24T18:00:00+09:00', ['雨']).areaTimeSeries },
    });
    await refreshWeather();
    const { items } = await listWeatherPage('2026-09-25' as DateString);
    expect(items.find((d) => d.date === '2026-09-24')?.slots).toEqual([
      { startMin: 1080, symbol: 'rain', label: '雨', temp: 20 },
      { startMin: 1260, symbol: 'rain', label: '雨', temp: 21 },
    ]);
  });

  it('祝日の日には印を付ける（日付の色をカレンダーと揃える）', async () => {
    // 9/23（秋分の日）だけを祝日にする
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:autumn',
            'DTSTART;VALUE=DATE:20260923',
            'DTEND;VALUE=DATE:20260924',
            'END:VEVENT',
            'END:VCALENDAR',
          ].join('\r\n'),
        ),
    );
    await refreshHolidays();
    const page = await listWeatherPage(undefined, new Date('2026-09-24T03:00:00Z'));
    expect(page.items.map((d) => [d.date, d.holiday])).toEqual([
      ['2026-09-23', true],
      ['2026-09-24', false],
      ['2026-09-25', false],
      ['2026-09-26', false],
    ]);
  });
});
