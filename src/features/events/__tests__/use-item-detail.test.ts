import { onlineManager } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { CalendarItem, EventMaster } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { renderHook } from '../../../lib/__tests__/render-hook.ts';
import { queryClient } from '../../../lib/query-client.ts';
import { eventQueryOptions } from '../queries.ts';
import { useItemDetail } from '../use-item-detail.tsx';

afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  queryClient.clear();
});

const MASTER: EventMaster = {
  id: 'e1',
  kind: 'task',
  title: 'ゴミ出し',
  allDay: false,
  startsAt: '2030-05-02T00:00:00.000Z',
  endsAt: null,
  completedAt: null,
  location: null,
  note: null,
  participantIds: ['u1'],
  rrule: 'FREQ=WEEKLY',
  remindStartMinutes: null,
  remindEndMinutes: null,
};

/** 繰り返しの 2 回目 */
const ITEM: CalendarItem = {
  ...MASTER,
  kind: 'task',
  endsAt: null,
  remindEndMinutes: null,
  startsAt: '2030-05-09T00:00:00.000Z',
  occurrenceStart: '2030-05-09T00:00:00.000Z',
  isRecurring: true,
  isModified: false,
  placementDate: '2030-05-09' as DateString,
};

/** 長押しで開いた（範囲の選択から始まる）詳細で「すべて」を選ぶ */
function editAll() {
  const noop = () => {};
  const { read } = renderHook(() => useItemDetail(ITEM, true, noop, noop), { client: queryClient });
  act(() => read().selectScope('all'));
  return read;
}

test('すべての回を直すときは、手元に前の繰り返し元があっても取り直してから入力欄にする', async () => {
  // 手元の行は古い（別の端末でタイトルを直した後）
  queryClient.setQueryData(eventQueryOptions('e1').queryKey, MASTER);
  let respond!: (res: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((resolve) => (respond = resolve)));

  const read = editAll();
  expect(read().fields).toBeNull();

  await act(async () => {
    respond(Response.json([{ result: { data: { ...MASTER, title: '資源ごみ' } } }]));
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });
  expect(read().fields?.initial.title).toBe('資源ごみ');
});

test('オフラインでは取り直しを待たず、手元の繰り返し元で入力欄にする', () => {
  onlineManager.setOnline(false);
  queryClient.setQueryData(eventQueryOptions('e1').queryKey, MASTER);

  const read = editAll();
  expect(read().fields?.initial).toMatchObject({ title: 'ゴミ出し', startsAt: MASTER.startsAt });
});
