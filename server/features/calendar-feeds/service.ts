import { addDays, today } from '../../../shared/date.ts';
import { newId } from '../../../shared/id.ts';
import type { CreateCalendarFeedInput } from '../../../shared/validation/calendar-feeds.ts';
import { resolveBaseUrl } from '../../lib/env.ts';
import { NotFoundError } from '../../lib/errors.ts';
import { listOccurrences } from '../events/service.ts';
import { toIcs } from './ics.ts';
import * as repository from './repository.ts';

/**
 * 配信する期間（今日を軸に前後の日数）。購読したカレンダーは定期的に取り直すので、窓は毎日ずれる。
 * 全期間を出さないのは、毎回の応答が繰り返しの展開ぶんだけ際限なく膨らむため。
 * 未来を 1 年より広く取るのは、来年の同じ月の予定（誕生日・記念日）を必ず含めるため。
 */
const PAST_DAYS = 180;
const FUTURE_DAYS = 400;

/** 画面に出す配信 URL。トークンそのものは外に出さず、URL の一部としてだけ渡す */
export type CalendarFeed = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  lastAccessedAt: string | null;
};

export async function listFeeds(userId: string): Promise<CalendarFeed[]> {
  return (await repository.findByUser(userId)).map(toFeed);
}

export async function createFeed(
  input: CreateCalendarFeedInput,
  userId: string,
): Promise<CalendarFeed> {
  const row = await repository.insert({
    id: newId(),
    userId,
    name: input.name,
    token: newToken(),
  });
  return toFeed(row);
}

/** 失効。他のユーザーの URL は消せない（見えてもいない） */
export async function revokeFeed(id: string, userId: string): Promise<void> {
  if (!(await repository.remove(id, userId))) {
    throw new NotFoundError('配信 URL が見つかりません');
  }
}

/**
 * トークンに対応する ics を作る。無効なトークンは 404 にするだけで、理由は返さない。
 *
 * 出すのは予定だけで、タスクは出さない。未完了のタスクが置かれる日は「今日」で毎日動き
 * （`shared/calendar.ts` の `placeTask`）、購読側のカレンダーでは日付が毎日書き換わり続けるため。
 * 参加者も出さない。ATTENDEE にすると購読しただけのカレンダーで出欠の返事を求められることがある。
 */
export async function renderIcs(token: string, now: Date = new Date()): Promise<string> {
  if (!(await repository.touchByToken(token, now))) {
    throw new NotFoundError('配信 URL が無効です');
  }
  const range = { from: addDays(today(now), -PAST_DAYS), to: addDays(today(now), FUTURE_DAYS) };
  const occurrences = await listOccurrences(range, now);
  return toIcs(
    occurrences.filter((occurrence) => occurrence.kind === 'event'),
    now,
  );
}

/**
 * 配信 URL。パスは `server/app.ts` の `/calendar` と `routes.ts` の `:file` に対応する。
 * `.ics` で終わらせるのは、拡張子でカレンダーだと判別するアプリがあるため。
 */
function feedUrl(token: string): string {
  return `${resolveBaseUrl()}/api/calendar/${token}.ics`;
}

/** 推測できないことだけが防御なので、256 ビットの乱数を base64url で表す */
function newToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

function toFeed(row: repository.CalendarFeedRow): CalendarFeed {
  return {
    id: row.id,
    name: row.name,
    url: feedUrl(row.token),
    createdAt: row.createdAt.toISOString(),
    lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
  };
}
