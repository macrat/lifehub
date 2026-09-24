import { z } from 'zod';
import { dateStringSchema } from './common.ts';

/** 3 時間ごとの天気を読む日（`GET /api/weather/hourly?date=`）。前後 1 日も一緒に返る */
export const hourlyWeatherQuerySchema = z.object({ date: dateStringSchema });
