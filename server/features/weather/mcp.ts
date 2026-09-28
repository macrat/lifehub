import { addDays, diffDays, fromMinutesOfDay, today } from '../../../shared/date.ts';
import { dateStringSchema } from '../../../shared/validation/common.ts';
import type { WeatherDay } from '../../../shared/weather.ts';
import { ValidationError } from '../../lib/errors.ts';
import { jstTime, weekdayOf } from '../../lib/mcp/time.ts';
import { compact, jsonResult, READ_ONLY, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

/** get_weather で読める期間の上限（日数） */
const MAX_DAYS = 31;

/** 1 日の天気を LLM に返す形にする（時刻は JST の HH:mm） */
function formatDay(day: WeatherDay) {
  const time = (startMin: number) => jstTime(fromMinutesOfDay(day.date, startMin));
  return compact({
    date: day.date,
    weekday: weekdayOf(day.date),
    holiday: day.holiday || undefined,
    summary: day.label,
    tempMax: day.tempMax,
    tempMin: day.tempMin,
    rainChance: day.pop,
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
      inputSchema: {
        from: dateStringSchema.optional().describe('最初の日（JST の YYYY-MM-DD）。省くと今日'),
        to: dateStringSchema
          .optional()
          .describe(`最後の日（その日を含む）。省くと from の 7 日後。期間は ${MAX_DAYS} 日まで`),
      },
      annotations: READ_ONLY,
    },
    async ({ from: fromInput, to: toInput }) => {
      const from = fromInput ?? today();
      const to = toInput ?? addDays(from, 7);
      if (from > to) throw new ValidationError('from は to 以前にしてください');
      if (diffDays(from, to) >= MAX_DAYS) {
        throw new ValidationError(`期間は ${MAX_DAYS} 日までです。分けて読んでください`);
      }
      const { items } = await service.listWeatherDays({ from, to });
      return jsonResult({ from, to, days: items.map(formatDay) });
    },
  );
};
