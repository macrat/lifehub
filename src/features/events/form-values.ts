import type { ChangeEvent } from 'react';
import {
  defaultTaskStart,
  type EventMaster,
  normalizeIsoInstants,
  switchedEnds,
  toInputIsoInstants,
} from '../../../shared/calendar.ts';
import { addDays, diffDays, fromMinutesOfDay, isDateString } from '../../../shared/date.ts';
import type { DateString } from '../../../shared/types.ts';
import { type EventKind, toAllDayRemind } from '../../../shared/validation/events.ts';
import {
  fromDateTimeLocalValue,
  fromDateValue,
  isDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../lib/date.ts';
import { FormFieldError, formList, formSelect, formText } from '../../lib/form.ts';

/**
 * 予定・タスクのフォームが扱う値（日時は ISO 文字列）。保存されている行（`EventMaster`）の入力できる項目なので、
 * カレンダーの項目や保存されている行をそのまま渡せる。endsAt は予定の終了（排他的）で、タスクでは null。
 * participantIds は 1 人以上（空は検証で弾かれる。新規作成の既定は `defaultParticipants`）。
 */
export type ItemFormValues = Omit<EventMaster, 'id' | 'kind' | 'completedAt'>;

/** 日時を除いた項目。日時は必ず呼び出し側が決めて重ねる */
type ItemDetails = Omit<ItemFormValues, 'allDay' | 'startsAt' | 'endsAt'>;

const EMPTY: ItemDetails = {
  title: '',
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
    allDay: false,
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
 * 予定・タスクの種類を切り替えた入力の既定値。引き継ぐ日時は開始（と終日か）だけで、終わりは
 * MCP の切り替えと同じ規則（`switchedEnds`）。開始前の通知・参加者・場所・メモ・繰り返しはそのまま
 * （通知の選び方は予定もタスクも同じ。`ExtraFields`）。
 * input は今の入力（入力欄で直した開始）。開始が空なら（書きかけ）新しいタスクと同じ今日の終日にする
 * （どちらの種類も開始が要る。`defaultTaskStart`）。
 */
export function switchKindValues(
  values: ItemFormValues,
  input: { allDay: boolean; startsAt: string | null },
  to: EventKind,
  now: Date = new Date(),
): ItemFormValues {
  const { allDay, startsAt } =
    input.startsAt === null
      ? defaultTaskStart(now)
      : { allDay: input.allDay, startsAt: new Date(input.startsAt) };
  const { endsAt, remindEndMinutes } = switchedEnds(to, allDay, startsAt);
  return {
    ...values,
    allDay,
    // 終わりは入力の形（終日なら含む日）で決まるので、保存の形へ直す
    ...normalizeIsoInstants(allDay, startsAt.toISOString(), endsAt?.toISOString() ?? null),
    remindEndMinutes,
  };
}

/**
 * 直している項目から持ち越す、日時以外の既定値（グリッドの下書きで種類を切り替えたとき）。
 * 項目がその種類のままなら全部、種類が違えば終了前の通知を消す（`switchKindValues` と同じ理由）。
 * 追加の下書き（項目なし）なら空の値。日時と参加者は呼び出し側が重ねる。
 */
export function carriedValues(
  item: (ItemFormValues & { kind: EventKind }) | null,
  kind: EventKind,
): ItemDetails {
  if (item === null) return EMPTY;
  const { allDay: _a, startsAt: _s, endsAt: _e, kind: _k, ...details } = item;
  return item.kind === kind ? details : { ...details, remindEndMinutes: null };
}

/**
 * 予定・タスクのフォームの入力 → 検証前の値（`createEventSchema` に渡す形）。
 * 全項目のフォーム・詳細からの編集・カレンダーのクイック入力（同じ項目を段で出し分ける）で同じ組み立てを使う。
 * 日時の入力欄が無いとき（PC のクイック入力の吹き出し）は、既定値の日時をそのまま使う（`savedInstants`）。
 * 空欄と入力欄が無いのとは違うので、値ではなく欄があるかで見分ける。開始（予定なら終了も）は必須なので、
 * 空欄は検証で止まる。タスクは終了の欄を持たず、終了と終了前の通知を送らない。
 * 予定の終了前の通知は MCP から入れたもので、フォームに出さないので既定値のまま送る。
 */
export function itemInputFromForm(
  kind: EventKind,
  formData: FormData,
  {
    initial,
    allDay,
    thisOnly = false,
  }: { initial: ItemFormValues; allDay: boolean; thisOnly?: boolean },
) {
  const startsRaw = whenRaw(formData, 'startsAt');
  const when =
    startsRaw === undefined
      ? savedInstants(initial)
      : {
          allDay,
          startsAt: toInstant('startsAt', startsRaw, allDay),
          endsAt:
            kind === 'event'
              ? toInstant('endsAt', whenRaw(formData, 'endsAt') ?? null, allDay)
              : null,
        };
  const extras = hasExtraFields(formData);
  return {
    kind,
    ...when,
    ...commonInput(formData, initial, { extras, thisOnly }),
    remindStartMinutes: extras
      ? remindSelected(formData)
      : savedRemind(initial.remindStartMinutes, allDay),
    remindEndMinutes: kind === 'event' ? savedRemind(initial.remindEndMinutes, allDay) : null,
  };
}

/** 開始前の通知の欄で選んだ値（何分前か。「通知しない」は null） */
function remindSelected(formData: FormData): number | null {
  const selected = formSelect(formData, 'remindStartMinutes');
  return selected === null ? null : Number(selected);
}

/**
 * 欄を出していない通知の値（既定値のまま）。終日なら日単位（当日・前日）に寄せる（入力欄の既定値と同じ。`toAllDayRemind`）。
 * 欄を出さずに終日へ切り替えた（PC の吹き出しで、つまんだ予定を終日欄へ動かした）ときに、
 * 終日では選べない「n 分前」のまま送って検証で止まらないように。
 */
function savedRemind(minutes: number | null, allDay: boolean): number | null {
  return allDay ? toAllDayRemind(minutes) : minutes;
}

/**
 * 残りの項目（場所・メモ・繰り返し・通知）の入力欄を出したしるしの欄の名前。`ExtraFields` が隠しの欄で必ず送る。
 * しるしが無いとき（PC のクイック入力の吹き出し）は、それらを既定値のまま送る。更新は全項目の置き換えなので、
 * 空で送ると、つまんで日時を動かしただけの予定の場所・メモ・通知を消してしまう。
 * WHY NOT 項目の欄そのもの（場所）で見分ける: 欄の並びを変えたときに黙って逆の結果になる。
 */
export const EXTRA_FIELDS_MARKER = 'extraFields';

function hasExtraFields(formData: FormData): boolean {
  return formData.has(EXTRA_FIELDS_MARKER);
}

/** 予定とタスクで同じ形の項目（タイトル・参加者・場所・メモ・繰り返し） */
function commonInput(
  formData: FormData,
  initial: ItemFormValues,
  { extras, thisOnly }: { extras: boolean; thisOnly: boolean },
) {
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

/**
 * 日時の入力欄の名前。日付（`type="date"`）と時刻（`type="time"`）の 2 つに分け、終日では時刻の欄を出さない。
 * name は保存の項目（開始 startsAt・終了 endsAt）。
 * WHY 分ける: 1 つの `datetime-local` だと、日だけ・時刻だけを直すときにも両方の入ったピッカーを開くことになる。
 */
export function whenFieldNames(name: 'startsAt' | 'endsAt') {
  return { date: `${name}Date`, time: `${name}Time` } as const;
}

/**
 * 日付と時刻に分けた入力欄の値を 1 つにする（終日は "YYYY-MM-DD"、時刻ありは "YYYY-MM-DDTHH:mm"）。
 * 時刻の欄が無ければ（終日）日付だけ。両方空なら null（未設定）、片方だけなら ''（書きかけ。`toInstant` が止める）。
 * フォームを読む（`whenRaw`）ときも、開始に合わせて終了を動かす（`endFollowsStart`）ときも同じ規則で繋ぐ。
 */
function joinWhen(date: string, time: string | undefined): string | null {
  if (time === undefined) return date || null;
  if (date && time) return `${date}T${time}`;
  return date || time ? '' : null;
}

/** `joinWhen` の逆: 1 つの値 → 日付と時刻の欄の値（終日の値なら時刻は空） */
export function splitWhen(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T');
  return { date, time };
}

/** 日時の入力欄の値（`joinWhen`）。欄が無ければ（PC のクイック入力の吹き出し）undefined */
function whenRaw(formData: FormData, name: 'startsAt' | 'endsAt'): string | null | undefined {
  const { date, time } = whenFieldNames(name);
  if (!formData.has(date)) return undefined;
  const timeValue = formData.get(time);
  return joinWhen(
    formText(formData, date) ?? '',
    typeof timeValue === 'string' ? timeValue : undefined,
  );
}

/**
 * 日時の入力欄の値（`joinWhen`）→ ISO 日時。未設定は null。
 * 書きかけ（日付か時刻の片方だけ。''）は、その欄の誤りとして止める（`FormFieldError`）。
 * WHY NOT 片方を補う（時刻を 0:00 にする等）: 入れたつもりの無い時刻が黙って保存される。
 */
function toInstant(
  name: 'startsAt' | 'endsAt',
  raw: string | null,
  allDay: boolean,
): string | null {
  if (raw === '') throw new FormFieldError(name, '日付と時刻を入力してください');
  if (raw === null) return null;
  return allDay && isDateString(raw) ? fromDateValue(raw) : fromDateTimeLocalValue(raw);
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

/** フォームの中の日時の入力欄（日付と、終日でなければ時刻）。今の値・初期値を 1 つにして読み、書き戻す */
function whenInputs(form: HTMLFormElement, name: 'startsAt' | 'endsAt') {
  const names = whenFieldNames(name);
  const date = form.elements.namedItem(names.date);
  const found = form.elements.namedItem(names.time);
  if (!(date instanceof HTMLInputElement)) return null;
  const time = found instanceof HTMLInputElement ? found : null;
  return {
    date,
    value: joinWhen(date.value, time?.value) ?? '',
    defaultValue: joinWhen(date.defaultValue, time?.defaultValue) ?? '',
    set: (value: string) => {
      const next = splitWhen(value);
      date.value = next.date;
      if (time) time.value = next.time;
    },
  };
}

/**
 * 予定の開始の入力欄（日付・時刻のどちらでも）の変更。終了の入力欄を、長さを保ったまま同じだけ動かす（`shiftedEnd`）。
 * 入力欄は制御しない（値は DOM が持つ）ので、動かす前の開始の値は開始の日付の欄に覚えておく（`data-previous`）。
 * 終日の切り替えで入力欄が作り直されたら、覚えた値は消えて新しい入力欄の初期値から数え直す。
 * 書きかけで空の間は覚え直さないので、書き終えたときに書き始める前の値からの差で動く。
 */
export function endFollowsStart({ target }: ChangeEvent<HTMLInputElement>): void {
  const form = target.form;
  const start = form && whenInputs(form, 'startsAt');
  if (!form || !start) return;
  const end = whenInputs(form, 'endsAt');
  if (end) {
    const shifted = shiftedEnd(
      start.date.dataset.previous ?? start.defaultValue,
      start.value,
      end.value,
    );
    if (shifted !== null) end.set(shifted);
  }
  if (start.value) start.date.dataset.previous = start.value;
}
