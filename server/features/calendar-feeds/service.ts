import { addDays, toDateString, today } from '../../../shared/date.ts';
import { newId } from '../../../shared/id.ts';
import type { CalendarFeedInput } from '../../../shared/validation/calendar-feeds.ts';
import { resolveBaseUrl } from '../../lib/env.ts';
import { NotFoundError } from '../../lib/errors.ts';
import { listOccurrences } from '../events/service.ts';
import { toIcs } from './ics.ts';
import type { CalendarFeedWithParticipants } from './repository.ts';
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
  /** この URL に載せる参加者。この中の誰かが入っている予定だけを配る */
  participantIds: string[];
  createdAt: string;
  lastAccessedAt: string | null;
};

export async function listFeeds(userId: string): Promise<CalendarFeed[]> {
  return (await repository.findByUser(userId)).map(toFeed);
}

export async function createFeed(input: CalendarFeedInput, userId: string): Promise<void> {
  await repository.insert(
    { id: newId(), userId, name: input.name, token: newToken(), createdAt: new Date() },
    input.participantIds,
  );
}

/** 名前と参加者の変更。渡した先を変えずに、その URL が配る範囲だけを絞り直せる */
export async function updateFeed(
  id: string,
  input: CalendarFeedInput,
  userId: string,
): Promise<void> {
  if (!(await repository.update(id, userId, input))) {
    throw new NotFoundError('配信 URL が見つかりません');
  }
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
 * 種別は展開する前に絞る（後から捨てると、1 年以上ぶんのタスクの繰り返しを毎回むだに展開する）。
 * 参加者は ATTENDEE として出さない。購読しただけのカレンダーで出欠の返事を求められることがある。
 *
 * 出すのは、その URL に載せた参加者の誰かが入っている予定だけ。絞り込みは展開した後に行う。
 * 「この回だけ」の変更で参加者が変わっている回があるので、繰り返し元の参加者で先に落とすと
 * その回まで一緒に落ちる（逆に、載せていない人だけの回が残ってしまうこともある）。
 */
export async function renderIcs(token: string, now: Date = new Date()): Promise<string> {
  const feed = await repository.touchByToken(token, now);
  if (!feed) throw new NotFoundError('配信 URL が無効です');
  const base = today(now);
  const range = { from: addDays(base, -PAST_DAYS), to: addDays(base, FUTURE_DAYS) };
  const occurrences = await listOccurrences(range, now, 'event');
  const included = occurrences.filter((occurrence) =>
    occurrence.participantIds.some((id) => feed.participantIds.includes(id)),
  );
  return toIcs(included, now);
}

/**
 * バックアップ用に、全員の全予定を 1 つの ics にする（`scripts/export-ics.ts`）。
 * LifeHub が使えなくなったときに、他のカレンダーアプリへ取り込んで予定を見られるようにするためのもの。
 *
 * 出す内容と形は配信（`renderIcs`）と同じにする。取り込む側から見て配信と同じ UID になるので、
 * 購読していたカレンダーと重ねても予定が二重にならない。参加者では絞らない。
 * 過去は最初の予定からすべて出す（期間の始まりを UNIX 元期にするのは「下限なし」の意味）。
 * 未来は配信と同じ幅で切る。終わりの無い繰り返しは、どこかで切らないと展開が終わらないため。
 */
export async function renderAllIcs(now: Date = new Date()): Promise<string> {
  const range = { from: toDateString(new Date(0)), to: addDays(today(now), FUTURE_DAYS) };
  return toIcs(await listOccurrences(range, now, 'event'), now);
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

/** 保存されている行（または今しがた保存した値）を画面に出す形にする */
function toFeed(
  row: Pick<
    CalendarFeedWithParticipants,
    'id' | 'name' | 'token' | 'participantIds' | 'createdAt' | 'lastAccessedAt'
  >,
): CalendarFeed {
  return {
    id: row.id,
    name: row.name,
    url: feedUrl(row.token),
    participantIds: row.participantIds,
    createdAt: row.createdAt.toISOString(),
    lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
  };
}
