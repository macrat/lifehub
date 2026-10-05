import { z } from 'zod';
import { type CalendarItem, EDGE_LABELS, occurrenceKey } from '../../../shared/calendar.ts';
import {
  DAY_MINUTES,
  DEFAULT_ALL_DAY_NOTIFY_MINUTES,
  TIME_ZONE,
} from '../../../shared/constants.ts';
import {
  addDays,
  allDayDate,
  fromMinutesOfDay,
  type InstantRange,
  startOfDate,
  toDateString,
  today,
} from '../../../shared/date.ts';
import type { PushMessage } from '../../../shared/push.ts';
import { instantSchema, uuidSchema } from '../../../shared/validation/common.ts';
import { listItems } from './occurrences.ts';

const EDGES = ['start', 'end'] as const;
type Edge = (typeof EDGES)[number];
/** 配信予定時刻と発生の日時の最大の隔たり。終日の「前日」の通知は 1 日と通知時刻の分だけ離れる */
const MAX_REMIND_MS = 2 * DAY_MINUTES * 60 * 1000;

/** 配信時に再検証するための参照。QStash のメッセージ本文に載せ、配信時に Zod で読み直す */
export const notificationRefSchema = z.object({
  id: uuidSchema,
  /** 繰り返しの回。単発は null */
  occurrenceStart: z.string().nullable(),
  edge: z.enum(EDGES),
  /** 予約したときの配信予定時刻。日時が変わってずれていたら送らない */
  at: instantSchema,
  /**
   * 宛先を 1 人に絞るときのユーザー。終日の項目は参加者ごとの通知時刻に送るので、参加者ごとに予約する。
   * 時刻のある項目は null（参加者全員に同じ時刻で送る）
   */
  userId: uuidSchema.nullable().default(null),
});
export type NotificationRef = z.infer<typeof notificationRefSchema>;

/** 配信直前の再検証（`resolveNotification`）が返す、送る中身と宛先 */
export type NotificationPayload = {
  title: string;
  body: string;
  /** タップで開く画面（アプリ内パス） */
  url: string;
  /** 送信先（参加者） */
  userIds: string[];
  /** 通知する発生（配信予定時刻の時点のもの）と、何の通知か（開始・予定の終了）。MCP Events の通知に載せる */
  item: CalendarItem;
  about: Edge;
};

export type PlannedNotification = {
  /** 冪等性のための一意キー（QStash の deduplicationId の元と送信台帳の主キー）。中身は読まない */
  key: string;
  at: Date;
  ref: NotificationRef;
};

function keyOf(ref: NotificationRef): string {
  const user = ref.userId ? `:${ref.userId}` : '';
  return `event:${ref.id}:${ref.occurrenceStart ?? 'single'}:${ref.edge}:${ref.at.toISOString()}${user}`;
}

/**
 * ユーザー ID → 終日の項目の通知時刻（その日の 0:00 からの分）。
 * 読み出しは通知の側（server/features/notifications）が行って渡す。この file は予定・タスクから
 * 通知を導く計算と events の読み出しだけを持ち、他の feature の保存先を読まない。
 */
export type NotifyTimes = Map<string, number>;

/**
 * 開始／予定の終了の通知の宛先と配信予定時刻と、通知する端の日時（anchor。本文に出す）。
 * 完了したタスクには送らない（タスクは終了を持たない）。
 * - 時刻のある項目: n 分前に参加者全員へ
 * - 終日の項目: その日（n = 1440 なら前日。終日の n は 0 か 1440 だけ）の、参加者それぞれの通知時刻に。
 *   終日の項目には「n 分前」の瞬間が無く（0:00 の n 分前では夜中に届く）、朝に知りたい時刻は人それぞれなので
 */
function remindTargets(
  item: CalendarItem,
  edge: Edge,
  notifyTimes: NotifyTimes,
): { at: Date; userId: string | null; anchor: string }[] {
  if (item.completedAt !== null) return [];
  const minutes = edge === 'start' ? item.remindStartMinutes : item.remindEndMinutes;
  const anchor = edge === 'start' ? item.startsAt : item.endsAt;
  if (minutes === null || anchor === null) return [];
  if (!item.allDay)
    return [
      { at: new Date(new Date(anchor).getTime() - minutes * 60 * 1000), userId: null, anchor },
    ];
  const day = addDays(allDayDate(anchor, edge), -minutes / DAY_MINUTES);
  return item.participantIds.map((userId) => ({
    at: new Date(fromMinutesOfDay(day, notifyTimes.get(userId) ?? DEFAULT_ALL_DAY_NOTIFY_MINUTES)),
    userId,
    anchor,
  }));
}

/**
 * 配信予定時刻が [from, to) に入りうる発生を、日ごとの重複（複数日の予定）を除いて列挙する。
 * `now` は範囲とは別に受け取る。タスクの表示位置と繰り返しの放棄はここを基準に決まるので、
 * 範囲の先頭を流用すると、配信時の再検証（範囲を配信予定時刻の前後 1 日に取る）で 1 日前の
 * 状態を見てしまい、リンク先の日付がずれる。
 */
async function itemsAround(range: InstantRange, now: Date): Promise<CalendarItem[]> {
  // タスクの表示位置は「今日」に繰り越されるので前後 1 日を含め、予定は最大リマインド分だけ先まで読む
  const items = await listItems(
    {
      from: addDays(toDateString(range.from), -1),
      to: addDays(toDateString(new Date(range.to.getTime() + MAX_REMIND_MS)), 1),
    },
    now,
  );
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = occurrenceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 通知本文の日時「9/20 15:00」（JST） */
const notificationTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 通知本文の日付「9/20」（JST）。終日の項目に使う */
const notificationDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
});

/** 本文: 「開始 9/20 15:00 ・ 場所」。終日は日付だけ（「開始 9/20 終日」）。anchor は通知する端の日時 */
function body(item: CalendarItem, edge: Edge, anchor: string): string {
  const label = EDGE_LABELS[edge];
  const when = item.allDay
    ? `${notificationDateFormatter.format(startOfDate(allDayDate(anchor, edge)))} 終日`
    : notificationTimeFormatter.format(new Date(anchor));
  const location = item.location ? ` ・ ${item.location}` : '';
  return `${label} ${when}${location}`;
}

/** [from, to) に配信すべき通知（予定・タスクの開始／終了の n 分前、参加者の全端末へ） */
export async function listNotifications(
  range: InstantRange,
  notifyTimes: NotifyTimes,
): Promise<PlannedNotification[]> {
  const planned: PlannedNotification[] = [];
  // 予約する範囲の先頭時点の状態で数える（日次 Cron は翌日分を、作成・変更時は今からの分を予約する）
  const items = await itemsAround(range, range.from);
  for (const item of items) {
    for (const edge of EDGES) {
      for (const { at, userId } of remindTargets(item, edge, notifyTimes)) {
        if (at < range.from || at >= range.to) continue;
        const ref = { id: item.id, occurrenceStart: item.occurrenceStart, edge, at, userId };
        planned.push({ key: keyOf(ref), at, ref });
      }
    }
  }
  return planned;
}

/** 配信直前の再検証。削除・変更（配信予定時刻や通知時刻がずれた、宛先が参加者でなくなった）・完了済みなら null */
export async function resolveNotification(
  ref: NotificationRef,
  notifyTimes: NotifyTimes,
): Promise<NotificationPayload | null> {
  // 配信予定時刻の時点の状態で見る（QStash の再送で実時刻がずれても、通知が指す瞬間は変わらない）
  const items = await itemsAround(
    {
      from: new Date(ref.at.getTime() - MAX_REMIND_MS),
      to: new Date(ref.at.getTime() + MAX_REMIND_MS),
    },
    ref.at,
  );
  const item = items.find((i) => i.id === ref.id && i.occurrenceStart === ref.occurrenceStart);
  if (!item) return null;
  const target = remindTargets(item, ref.edge, notifyTimes).find(
    (t) => t.userId === ref.userId && t.at.getTime() === ref.at.getTime(),
  );
  if (!target) return null;
  return {
    title: item.kind === 'task' ? `タスク: ${item.title}` : item.title,
    body: body(item, ref.edge, target.anchor),
    url: `/calendar?date=${item.placementDate}`,
    userIds: target.userId ? [target.userId] : item.participantIds,
    item,
    about: ref.edge,
  };
}

/** 予定・タスクの追加・削除の通知が知らせる操作 */
export type ChangeAction = 'added' | 'deleted';

const CHANGE_LABELS = { added: '追加', deleted: '削除' } as const satisfies Record<
  ChangeAction,
  string
>;
const KIND_LABELS = { event: '予定', task: 'タスク' } as const;

/**
 * 予定・タスク（id。繰り返しなら全部の回）のうち、今日の時点で手を付ける必要がある回。追加・削除をすぐ知らせる対象。
 * - タスク: 今日に置かれた未完了の回。開始が今日の物と、開始を過ぎても完了するまで今日に繰り越された物
 *   （繰り越しと繰り返しの放棄は一覧と同じ規則。`listItems`）
 * - 予定: 開始が今日で、まだ始まっていない回。始まった予定は知らせても間に合わない
 * - 終日の予定: 今日の物。時刻を持たないので「始まった」が無い（0:00 の開始で除くと、当日には一度も知らせられない）。
 *   前の日から続く終日の予定は、開始が過ぎているので除く
 */
export async function actionableToday(id: string, now: Date): Promise<CalendarItem[]> {
  const day = today(now);
  const items = await listItems({ from: day, to: day }, now, { id });
  return items.filter((item) => {
    if (item.placementDate !== day) return false;
    if (item.kind === 'task') return item.completedAt === null;
    return item.allDay ? allDayDate(item.startsAt, 'start') === day : new Date(item.startsAt) > now;
  });
}

/** 追加・削除を知らせる相手: 知らせる回の参加者のうち、操作した人以外（自分の操作は自分が知っている） */
export function changeRecipients(items: CalendarItem[], actorId: string): string[] {
  return [...new Set(items.flatMap((item) => item.participantIds))].filter((id) => id !== actorId);
}

/**
 * 追加・削除の通知。見出しは「〈名前〉がタスクを追加しました」、本文は開始前の通知と同じ「開始 9/20 15:00 ・ 場所」
 * （繰り越したタスクは開始が昨日以前なので、「今日」ではなく日付で示す）
 */
export function changeMessage(
  item: CalendarItem,
  action: ChangeAction,
  actorName: string,
): PushMessage {
  return {
    title: `${actorName}が${KIND_LABELS[item.kind]}を${CHANGE_LABELS[action]}しました`,
    body: body(item, 'start', item.startsAt),
    url: `/calendar?date=${item.placementDate}`,
    // 同じ追加・削除の送り直し（オフラインで溜めた書き込みの再送）は、端末で前の通知に重ねて 1 つにする
    tag: `change:${action}:${item.id}:${item.occurrenceStart ?? 'single'}`,
  };
}
