import { z } from 'zod';
import { cursorShape } from '../../../shared/validation/common.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

export const weatherRouter = router({
  /** 週間天気の 1 ページ（日ごとの天気と 3 時間ごとの天気） */
  page: procedure
    .input(z.object(cursorShape))
    .query(({ input }) => service.listWeatherPage(input.before)),
});
