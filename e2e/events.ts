import type { Page } from '@playwright/test';
import { mutate } from './api.ts';
import { myId } from './auth.ts';

/** API で置く予定・タスク。日時は時差付きの ISO 8601 で書き、参加者を省くと自分だけにする */
type Item = {
  kind: 'event' | 'task';
  title: string;
  allDay?: boolean;
  startsAt?: string;
  endsAt?: string;
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
  await mutate(page.request, 'events.create', { id, ...item, participantIds });
  return id;
}

/** 置いた予定・タスクを API で消す（後片付け。同じ日を使う他のテストの操作に掛からないようにする） */
export async function deleteItem(page: Page, id: string): Promise<void> {
  await mutate(page.request, 'events.delete', { id, scope: 'all' });
}
