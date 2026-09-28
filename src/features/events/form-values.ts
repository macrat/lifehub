import type { ChangeEvent } from 'react';
import { type EventMaster, toInputIsoInstants } from '../../../shared/calendar.ts';
import { addDays, diffDays, fromMinutesOfDay, isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { toAllDayRemind } from '../../../shared/validation/events.ts';
import {
  fromDateTimeLocalValue,
  fromDateValue,
  isDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../lib/date.ts';
import { formList, formSelect, formText } from '../../lib/form.ts';

/**
 * 予定・タスクのフォームが扱う値（日時は ISO 文字列）。保存されている行（`EventMaster`）の入力できる項目なので、
 * カレンダーの項目や保存されている行をそのまま渡せる。endsAt は予定では終了（排他的）、タスクでは期限。
 * participantIds は 1 人以上（空は検証で弾かれる。新規作成の既定は `defaultParticipants`）。
 */
export type ItemFormValues = Omit<EventMaster, 'id' | 'kind' | 'completedAt'>;

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

/**
 * 新規作成の既定の参加者: 自分だけ。相手の予定を勝手に増やさないよう、
 * 一緒に入れたいときだけ参加者を足してもらう。ログイン中のユーザーがまだ読めていなければ空
 * （検証の「1 人以上」で止まるので、誰にも紐づかない予定は保存されない）。
 */
export function defaultParticipants(meId: string | null): string[] {
  return meId === null ? [] : [meId];
}

/** 指定日の時間帯（0:00 からの分）の予定の既定値。タイムラインのドラッグで選んだ時間帯をそのまま渡す */
export function eventValuesForRange(
  date: DateString,
  startMin: number,
  endMin: number,
  participantIds: string[],
): ItemFormValues {
  return {
    ...EMPTY,
    participantIds,
    startsAt: fromMinutesOfDay(date, startMin),
    endsAt: fromMinutesOfDay(date, endMin),
  };
}

/**
 * 指定した日（両端を含む）の終日の予定の既定値。月表示・終日欄で選んだ期間をそのまま渡す。
 * 終了は保存されている予定と同じ「排他的な終わり」（翌日 0:00）で持つ。
 */
export function allDayEventValues(
  from: DateString,
  to: DateString,
  participantIds: string[],
): ItemFormValues {
  return {
    ...EMPTY,
    participantIds,
    allDay: true,
    startsAt: fromDateValue(from),
    endsAt: fromDateValue(addDays(to, 1)),
  };
}

/**
 * タスクの既定値: 終日で、日時なし。開始日時の無い未完了タスクは今日の位置に出るので、
 * 「いつかやる」を入れるときは日時に触らずに済む（予定と違って時間の枠を持たない）。
 * 終日にするのは、タスクの期限はたいてい「この日まで」で、時刻まで決めることは少ないから
 * （日付だけの欄なら日を選ぶだけで済む。時刻が要るときは「終日」を切る）。
 */
export function defaultTaskValues(participantIds: string[]): ItemFormValues {
  return { ...EMPTY, participantIds, allDay: true };
}

/**
 * 予定のフォームの入力 → 検証前の値（`createEventSchema` に渡す形）。
 * 全項目のフォームと、スマホのクイック入力（同じ項目を段で出し分ける）で同じ組み立てを使う。
 * 日時の入力欄が無いとき（PC のクイック入力の吹き出し）や空のときは、既定値の日時をそのまま使う（`savedInstants`）。
 * 予定の日時は必須なので、空欄は「未設定」ではなく入力の途中とみなす。
 */
export function eventInputFromForm(
  formData: FormData,
  {
    initial,
    allDay,
    thisOnly = false,
  }: { initial: ItemFormValues; allDay: boolean; thisOnly?: boolean },
) {
  const startsRaw = formText(formData, 'startsAt');
  const endsRaw = formText(formData, 'endsAt');
  const when =
    startsRaw && endsRaw
      ? { allDay, startsAt: toInstant(startsRaw, allDay), endsAt: toInstant(endsRaw, allDay) }
      : savedInstants(initial);
  // 終日の予定の通知は日単位（当日・前日）なので、終日にしたら寄せる（入力欄の既定値と同じ）
  const remind = (minutes: number | null) => (allDay ? toAllDayRemind(minutes) : minutes);
  return {
    kind: 'event' as const,
    ...when,
    ...commonInput(formData, initial, thisOnly),
    remindStartMinutes: hasExtraFields(formData)
      ? formSelect(formData, 'remindStartMinutes') === null
        ? null
        : Number(formText(formData, 'remindStartMinutes'))
      : remind(initial.remindStartMinutes),
    // フォームに出していない終了前の通知（MCP から入れたもの）も、終日にしたら日単位に寄せる
    remindEndMinutes: remind(initial.remindEndMinutes),
  };
}

/**
 * タスクのフォームの入力 → 検証前の値（`createEventSchema` に渡す形）。
 * 予定と違って開始・期限はどちらも任意で、通知は「その日時に」（= 0 分前）の 2 択。
 * 終日では開始日・期限日（日付だけ）を受け取り、通知はその日の各自の通知時刻になる。
 * 日時の入力欄が無いとき（PC のクイック入力の吹き出し）は既定値の日時をそのまま使う。
 * 空欄（未設定）と入力欄が無いのとは違うので、値ではなく欄があるかで見分ける。
 */
export function taskInputFromForm(
  formData: FormData,
  {
    initial,
    allDay,
    thisOnly = false,
  }: { initial: ItemFormValues; allDay: boolean; thisOnly?: boolean },
) {
  const when = formData.has('startsAt')
    ? {
        allDay,
        startsAt: optionalInstant(formText(formData, 'startsAt'), allDay),
        endsAt: optionalInstant(formText(formData, 'endsAt'), allDay),
      }
    : savedInstants(initial);
  const extras = hasExtraFields(formData);
  return {
    kind: 'task' as const,
    ...when,
    ...commonInput(formData, initial, thisOnly),
    // チェックを外した欄は FormData に載らないので、欄が無いのとは残りの項目の欄があるかで見分ける
    remindStartMinutes: extras
      ? formData.get('notifyAtStart') === 'on'
        ? 0
        : null
      : initial.remindStartMinutes,
    remindEndMinutes: extras
      ? formData.get('notifyAtEnd') === 'on'
        ? 0
        : null
      : initial.remindEndMinutes,
  };
}

/**
 * 残りの項目（場所・メモ・繰り返し・通知。`ExtraFields`）の入力欄があるか。いつも出る場所の欄で見分ける。
 * 無いとき（PC のクイック入力の吹き出し）は、それらを既定値のまま送る。更新は全項目の置き換えなので、
 * 空で送ると、つまんで日時を動かしただけの予定の場所・メモ・通知を消してしまう。
 */
function hasExtraFields(formData: FormData): boolean {
  return formData.has('location');
}

/** 予定とタスクで同じ形の項目（タイトル・参加者・場所・メモ・繰り返し） */
function commonInput(formData: FormData, initial: ItemFormValues, thisOnly: boolean) {
  const extras = hasExtraFields(formData);
  return {
    title: formText(formData, 'title') ?? '',
    participantIds: formList(formData, 'participantIds'),
    location: extras ? formText(formData, 'location') : initial.location,
    note: extras ? formText(formData, 'note') : initial.note,
    // 「この回だけ」は繰り返しの欄を出さず、繰り返し元のルールのまま送る
    rrule: extras && !thisOnly ? formText(formData, 'rrule') : initial.rrule,
  };
}

/**
 * 既定値（保存されている形）の日時 → 入力と同じ形。終日の終わりは排他的な終端から「含む日」へ戻す
 * （そのまま送るとサーバーがもう 1 日延ばす。`toInputIsoInstants`）。
 */
function savedInstants({ allDay, startsAt, endsAt }: ItemFormValues) {
  return { allDay, ...toInputIsoInstants(allDay, startsAt, endsAt) };
}

/** 日時の入力欄の値 → ISO 日時。終日では日付だけの欄（`type="date"`）から来る */
function toInstant(raw: string, allDay: boolean): string {
  return allDay && isDateString(raw) ? fromDateValue(raw) : fromDateTimeLocalValue(raw);
}

/** 任意の日時の入力欄（タスクの開始・期限）。空欄は未設定 */
function optionalInstant(raw: string | null, allDay: boolean): string | null {
  return raw ? toInstant(raw, allDay) : null;
}

/**
 * 開始の入力欄を before から after に動かしたときの、終了の入力欄の新しい値。長さを保って同じだけ動かす
 * （9:00〜10:00 の開始を 9:30 にすると終了は 10:30。終日なら日数を保つ）。
 * 値はどれも入力欄の値のままで、終日（日付だけ）か日時かは値の形で分かる。
 * 形の揃わない値（書きかけで空、終日の切り替えの前後が混ざる）なら null で、終了は触らない。
 */
export function shiftedEnd(before: string, after: string, end: string): string | null {
  if (isDateString(before) && isDateString(after) && isDateString(end))
    return addDays(end, diffDays(before, after));
  if (![before, after, end].every(isDateTimeLocalValue)) return null;
  const ms = (value: string) => Date.parse(fromDateTimeLocalValue(value));
  return toDateTimeLocalValue(new Date(ms(end) + ms(after) - ms(before)));
}

/**
 * 予定の開始の入力欄の変更。終了の入力欄を、長さを保ったまま同じだけ動かす（`shiftedEnd`）。
 * 入力欄は制御しない（値は DOM が持つ）ので、動かす前の開始の値は入力欄そのものに覚えておく（`data-previous`）。
 * 終日の切り替えで入力欄が作り直されたら、覚えた値は消えて新しい入力欄の初期値から数え直す。
 * 書きかけで空の間は覚え直さないので、書き終えたときに書き始める前の値からの差で動く。
 */
export function endFollowsStart({ target: start }: ChangeEvent<HTMLInputElement>): void {
  const end = start.form?.elements.namedItem('endsAt');
  if (end instanceof HTMLInputElement) {
    const shifted = shiftedEnd(
      start.dataset.previous ?? start.defaultValue,
      start.value,
      end.value,
    );
    if (shifted !== null) end.value = shifted;
  }
  if (start.value) start.dataset.previous = start.value;
}
