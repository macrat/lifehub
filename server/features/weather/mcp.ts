import { z } from 'zod';
import { fromMinutesOfDay } from '../../../shared/date.ts';
import type { WeatherDay } from '../../../shared/weather.ts';
import { weatherSummary } from '../../lib/mcp/entries.ts';
import { dateRangeInput, jstTime, weekdayOf } from '../../lib/mcp/time.ts';
import { compact, jsonResult, READ_ONLY, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

/** get_weather の期間: 既定は 8 日（今日と週間予報の 7 日）、最大 31 日 */
const range = dateRangeInput(8, 31);

/** 1 日の天気を LLM に返す形にする（時刻は JST の HH:mm） */
function formatDay(day: WeatherDay) {
  const time = (startMin: number) => jstTime(fromMinutesOfDay(day.date, startMin));
  return compact({
    date: day.date,
    weekday: weekdayOf(day.date),
    holiday: day.holiday || undefined,
    ...weatherSummary(day),
    every3h: day.slots.length
      ? day.slots.map((s) => compact({ from: time(s.startMin), weather: s.label, temp: s.temp }))
      : undefined,
    rainChanceEvery6h: day.pops.length
      ? day.pops.map((p) => ({ from: time(p.startMin), rainChance: p.pop }))
      : undefined,
  });
}

export const registerWeatherTools: ToolRegistrar = (server) => {
  server.registerTool(
    'get_weather',
    {
      title: '天気',
      description:
        '東京（気象庁の予報）の天気を日ごとに返す: 天気の要約、最高・最低気温（℃）、降水確率（%）。3 時間ごとの天気と気温（every3h）と 6 時間ごとの降水確率（rainChanceEvery6h）は明日まで。予報は 7 日先まで。過ぎた日は、その日の最後の予報と実際の気温を返す。予報も記録も無い日は含まない。今日と明日の天気の要約だけなら get_overview にもある。',
      inputSchema: z.object(range.shape),
      annotations: READ_ONLY,
    },
    async (input) => {
      const period = range.resolve(input);
      const days = await service.listWeatherDays(period);
      return jsonResult({ ...period, days: days.map(formatDay) });
    },
  );
};
