import type { DateString } from '../../../shared/types.ts';

/** 予定・タスクのフォームが扱う値（日時は ISO 文字列）。カレンダーの項目や保存されている行をそのまま渡せる */
export type ItemFormValues = {
  title: string;
  allDay: boolean;
  startsAt: string | null;
  /** 予定では終了（排他的）、タスクでは期限 */
  endsAt: string | null;
  /** 空なら全員（新規作成の既定） */
  participantIds: string[];
  location: string | null;
  note: string | null;
  rrule: string | null;
  remindStartMinutes: number | null;
  remindEndMinutes: number | null;
};

const EMPTY: ItemFormValues = {
  title: '',
  allDay: false,
  startsAt: null,
  endsAt: null,
  participantIds: [],
  location: null,
  note: null,
  rrule: null,
  remindStartMinutes: null,
  remindEndMinutes: null,
};

/** 予定の既定値: 指定日の 10 時（無ければ次の正時）から 1 時間 */
export function defaultEventValues(date?: DateString): ItemFormValues {
  const base = date ? new Date(`${date}T10:00:00+09:00`) : new Date();
  if (!date) {
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
  }
  const end = new Date(base.getTime() + 60 * 60 * 1000);
  return { ...EMPTY, startsAt: base.toISOString(), endsAt: end.toISOString() };
}

/** タスクの既定値: 指定日があればその 9 時に開始、無ければ日時なし（今日の位置に出る） */
export function defaultTaskValues(date?: DateString): ItemFormValues {
  return {
    ...EMPTY,
    startsAt: date ? new Date(`${date}T09:00:00+09:00`).toISOString() : null,
  };
}
