import type { CalendarItem } from '../../../shared/calendar.ts';
import { DAY_MINUTES } from '../../../shared/constants.ts';
import { addDays, type InstantRange, instantRange, today } from '../../../shared/date.ts';
import type { PushMessage } from '../../../shared/push.ts';
import { afterResponse } from '../../lib/after-response.ts';
import { nameOf } from '../../lib/people.ts';
import {
  type ChangeAction,
  changeMessage,
  changeRecipients,
  listNotifications,
  type NotificationRef,
  resolveNotification,
} from '../events/notifications.ts';
import { publishReminder } from '../mcp-events/service.ts';
import { sendToUsers } from '../push/service.ts';
import { listAllDayNotifyMinutes, listPeople } from '../users/people.ts';
import { createPublisher, type Publisher } from './publisher.ts';
import * as repository from './repository.ts';

const SENT_RETENTION_DAYS = 30;

/** 指定期間の通知を列挙して QStash に予約する。予約先が無い環境（ローカル・Preview）では何もしない。 */
export async function enqueueRange(
  range: InstantRange,
  publisher: Publisher | null = createPublisher(),
): Promise<{ planned: number; published: number }> {
  const planned = await listNotifications(range, await listAllDayNotifyMinutes());
  if (!publisher) return { planned: planned.length, published: 0 };
  // 1 件ずつ待つと件数分の往復が直列に積み重なる（日次 Cron の応答や、書き込みの後の予約が長引く）。
  // 並べて投げ、失敗した分だけ記録する（1 件の失敗で他を止めない。重複は deduplicationId で防がれる）
  const published = await Promise.all(
    planned.map(async (item) => {
      try {
        await publisher.publish(item);
        return true;
      } catch (error) {
        console.error(`notifications: failed to publish ${item.key}`, error);
        return false;
      }
    }),
  );
  return { planned: planned.length, published: published.filter(Boolean).length };
}

/** 日次 Cron: 翌日分（JST の翌日 0:00 〜 翌々日 0:00）を予約し、古い送信台帳を消す */
export async function enqueueTomorrow(
  now: Date = new Date(),
): Promise<{ planned: number; published: number }> {
  await repository.purgeSentBefore(
    new Date(now.getTime() - SENT_RETENTION_DAYS * DAY_MINUTES * 60_000),
  );
  const tomorrow = addDays(today(now), 1);
  return enqueueRange(instantRange({ from: tomorrow, to: tomorrow }));
}

/**
 * 通知を増やしうる書き込み（予定・タスクの作成・変更・完了の取り消し、終日の通知時刻の変更）の後に呼ぶ。
 * 今から翌日の終わりまでに発生する通知を、応答を返した後で予約する（書き込みの応答は予約を待たない）。
 * 日次 Cron は翌日分しか予約しないので、当日の分はここで予約しないと届かない。
 * 日次 Cron が既に予約した分は deduplicationId で重複しない。減らす書き込み（削除・完了）は呼ばなくてよい
 * （古い予約は配信時の再検証で捨てられる）。
 */
export function scheduleUpcoming(now: Date = new Date()): void {
  afterResponse('notifications: enqueueUpcoming', () => enqueueUpcoming(now));
}

async function enqueueUpcoming(now: Date): Promise<void> {
  // 予約先が無い環境（ローカル・Preview）では、列挙（予定の読み出しと繰り返しの展開）もしない
  const publisher = createPublisher();
  if (!publisher) return;
  const { to } = instantRange({ from: today(now), to: addDays(today(now), 1) });
  await enqueueRange({ from: now, to }, publisher);
}

/**
 * 配信: 台帳に無いキーだけ、参照を再検証して送る。プッシュ通知を送れたら、MCP Events の通知も同じ宛先へ配る
 * （プッシュの失敗で QStash が送り直すときに、MCP Events だけが先に届いて重複しないよう、送れた後に配る）。
 * 台帳への記録（claim）を先に行い、同時に届いた同じキーの配信を 1 つにする。記録した後に失敗したら
 * （送る内容の読み出しでも送信でも）記録を取り消して例外を投げ、QStash の再試行で送り直せるようにする。
 * 取り消さないと、再試行が「送信済み」と判定されて通知が届かないまま終わる。
 * 再検証で対象が消えていた（stale）ときは記録を残す。送り直しても送る物は無い。
 */
export async function deliver(
  key: string,
  ref: NotificationRef,
  send: (userIds: string[], message: PushMessage) => Promise<unknown> = sendToUsers,
): Promise<'sent' | 'duplicate' | 'stale'> {
  if (!(await repository.claim(key))) return 'duplicate';
  try {
    const payload = await resolveNotification(ref, await listAllDayNotifyMinutes());
    if (!payload) return 'stale';
    await send(payload.userIds, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: key,
    });
    publishReminder(key, payload);
    return 'sent';
  } catch (error) {
    await repository.release(key);
    throw error;
  }
}

/**
 * 予定・タスクの追加・削除を、今日の時点で手を付ける必要がある回（`actionableToday`）があれば、
 * 操作した人以外の参加者へすぐプッシュ通知する（相手が今日の買い物のタスクを足したら知って、代わりに
 * 済ませられるように）。応答を返した後に送る。
 * 開始前の通知と違って予約も再検証もしない。操作の直後に送るので、送る時点の内容が操作した物そのもの。
 * 送れなくても書き込みは取り消さず、ログに残すだけにする（予約の通知と違い、送り直す仕組みを持たない）。
 * items は知らせる回。追加は書いた後に読めばよいので読みかけ（Promise）で、削除は消すと読めないので消す前に読んで渡す。
 */
export function notifyChanged(
  items: CalendarItem[] | Promise<CalendarItem[]>,
  action: ChangeAction,
  actorId: string,
): void {
  afterResponse('notifications: notifyChanged', async () => {
    const actionable = await items;
    const [first] = actionable;
    const userIds = changeRecipients(actionable, actorId);
    if (!first || userIds.length === 0) return;
    const actorName = nameOf(await listPeople(), actorId);
    // 繰り越したタスクと今日の回が並ぶなど、知らせる回が 2 つ以上あっても、1 つの操作には通知を 1 つだけ送る
    await sendToUsers(userIds, changeMessage(first, action, actorName));
  });
}
