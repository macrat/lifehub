import { z } from 'zod';
import { dateStringSchema } from '../../../shared/validation/common.ts';

/** 週間天気の画面の検索パラメータ */
export const weatherSearchSchema = z.object({
  /**
   * 開いた日（予定画面で天気を押した日、ホームのタイルの日）。その日の行を画面に収め（`useRevealDay`）、
   * その日のアイコンだけが前の画面の同じ日のアイコンとその場で動く（`useIconMoves`）。直に開いたときは無い
   */
  day: dateStringSchema.optional(),
});
