import type { Page } from '@playwright/test';
import { defaultTaskStart } from '../shared/calendar.ts';
import { apiOf } from './api.ts';
import { myId } from './auth.ts';

/**
 * API で置く予定・タスク。日時は時差付きの ISO 8601 で書き、参加者を省くと自分だけにする。
 * タスクは開始を省くと今日の終日（画面の追加・MCP の既定と同じ）
 */
type Item = (
  | { kind: 'event'; startsAt: string; endsAt: string }
  | { kind: 'task'; startsAt?: string }
) & {
  title: string;
  allDay?: boolean;
  rrule?: string;
  location?: string;
  note?: string;
  participantIds?: string[];
};

/**
 * 予定・タスクを API で 1 件置き、ID を返す（書き込みは値を返さないので、ID は送る側が決める）。
 * 画面からの追加そのものを確かめないテストの準備に使う。画面から作ると 1 件ごとに数秒かかり、
 * 確かめたいことより前の操作でテストが落ちうる所も増える。
 */
export async function addItem(page: Page, item: Item): Promise<string> {
  const id = crypto.randomUUID();
  const participantIds = item.participantIds ?? [await myId(page)];
  // 開始を省いたタスクは、画面・MCP と同じく今日の終日（予定は開始を必ず持つ）
  const { allDay, startsAt } =
    item.startsAt === undefined
      ? defaultTaskStart()
      : { allDay: item.allDay ?? false, startsAt: new Date(item.startsAt) };
  await apiOf(page.request).events.create.mutate({
    id,
    ...item,
    allDay,
    startsAt: startsAt.toISOString(),
    participantIds,
  });
  return id;
}

/** 置いた予定・タスクを API で消す（後片付け。同じ日を使う他のテストの操作に掛からないようにする） */
export async function deleteItem(page: Page, id: string): Promise<void> {
  await apiOf(page.request).events.delete.mutate({ id, scope: 'all' });
}

/**
 * カレンダーの追加ボタンから種類を選んで入力を開く。SpeedDial はホバーでも開くので、ホバーで開く
 * （click だとホバーで開いた直後の click で閉じてしまうことがある）
 */
export async function addOnCalendar(page: Page, kind: '予定' | 'タスク'): Promise<void> {
  await page.getByRole('button', { name: '予定・タスクを追加' }).hover();
  await page.getByRole('menuitem', { name: kind }).click();
}
