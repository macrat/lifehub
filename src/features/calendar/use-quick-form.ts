import { type RefObject, useMemo } from 'react';
import type { EventKind } from '../../../shared/validation/events.ts';
import { carriedValues, type ItemFormValues } from '../events/form-values.ts';
import { grabbedScope } from '../events/recurrence-options.ts';
import { useAllDay, useItemForm } from '../events/use-item-form.ts';
import { type DraftRange, withAllDay } from './draft.ts';
import { draftFromInstants, draftText, draftValues } from './event-draft.ts';
import { taskDraftFromInput, taskDraftText, taskTimesAt } from './task-draft.ts';
import type { QuickProps } from './use-event-composer.ts';

/**
 * クイック入力の状態と操作（`useQuickForm`）が入れ物（`QuickForm`）に渡すもの。
 * 入れ物（シート・吹き出し）と項目は予定とタスクで同じで、違うのは上の段に出す日時と通知の項目（`kind`）だけ。
 */
export type Quick = {
  formRef: RefObject<HTMLFormElement | null>;
  form: Pick<
    ReturnType<typeof useItemForm>,
    'errors' | 'submitError' | 'thisOnly' | 'submitted' | 'handleSubmit'
  >;
  /** 入力の既定値（タイトルと、全項目のフォームへ引き継ぐ残りの項目） */
  initial: ItemFormValues;
  /** 下の段（PC は吹き出し）に出す日時の見出し */
  rangeText: string;
  /** 上の段で直した日時を下書き（見出しとグリッドの枠）へ映す。スマホのシートを下の段に戻すとき */
  syncDraft: () => void;
  /** 終日か。予定は下書き、タスクはフォームが持つ */
  allDay: boolean;
  changeAllDay: (allDay: boolean) => void;
  /** PC の「その他のオプション」で全項目のフォームへ引き継ぐ値 */
  expandValues: () => ItemFormValues;
  /**
   * 予定・タスクの切り替え。上の段で直した日時を先に下書きへ映してから切り替える
   * （引き継ぐ開始が、入力欄で直した開始になるように）
   */
  switchKind: (kind: EventKind) => void;
};

type Options = Pick<
  QuickProps,
  'draft' | 'onSubmit' | 'onChangeDraft' | 'onSwitchKind' | 'onClose'
>;

/**
 * クイック入力（予定・タスク）の状態と操作。入力欄の値はフォームの DOM が持つので、
 * 下書きへ映し戻すときも全項目のフォームへ引き継ぐときも、`formRef` の form から読む。
 * つまんだ繰り返しの回はその回だけを直す（`grabbedScope`。回の行は繰り返さないので繰り返しの設定は触らせない）。
 *
 * 予定とタスクで 1 つのフックにし、日時の扱いだけを種類（`draft.kind`）で分ける。
 * WHY: 入力の途中で種類を切り替えても、入れ物とタイトルなどの入力欄を作り直さないため
 * （フックが種類ごとに分かれると、それを呼ぶコンポーネントも分かれ、切り替えると入れ物ごと作り直して入力が消える）。
 * - 予定: 日時（終日かどうかを含む）は下書きの範囲（`draft.range`）だけが持つ。入力で直した日時と終日の
 *   切り替えは下書きへ戻し、見出し・グリッドの枠・保存する日時がいつも同じ下書きから決まるようにする
 *   （入力の側にも持つと、開いたままグリッドで別の種類の枠を選び直したときに食い違う）。
 * - タスク: 日時は枠と、それを動かす元の日時（`draft.times`）から導き（`taskTimesAt`）、上の段で直した日時は
 *   下の段に戻るときに両方へ戻す（`taskDraftFromInput`）。終日かどうかはフォームが持つ（タスクの終日は置き方ではなく
 *   日時の形なので、切り替えても枠は動かない）。枠を動かしたとき（置いた値が変わったとき）だけ合わせ直す。
 */
export function useQuickForm({
  draft,
  onSubmit,
  onChangeDraft,
  onSwitchKind,
  onClose,
}: Options): Quick {
  const { range, item, participantIds } = draft;
  const times = draft.kind === 'task' ? draft.times : null;
  // 枠から導く値。タスクの終日の状態（`useAllDay`）はこれが変わったとき（枠を動かしたとき）だけ合わせ直す
  // （描画ごとや参加者を選び直すたびに合わせ直すと、選んだ終日が戻ってしまう）
  const placed = useMemo(
    () =>
      times
        ? { ...carriedValues(item, 'task'), ...taskTimesAt(times, range) }
        : draftValues(range, [], item),
    [times, range, item],
  );
  const [taskAllDay, setTaskAllDay] = useAllDay(placed.allDay, placed);
  const allDay = times ? taskAllDay : range.allDay;
  const initial = { ...placed, participantIds };
  const form = useItemForm({
    kind: draft.kind,
    initial,
    allDay,
    scope: grabbedScope(item),
    onSubmit,
    onSaved: onClose,
  });
  const { readInput } = form;

  /** 入力欄の日時 → 予定の枠。枠に出せない範囲（日をまたぐ時間指定など）なら null */
  const eventRangeFromForm = (): DraftRange | null => {
    const input = readInput();
    return input?.startsAt && input.endsAt
      ? draftFromInstants(input.allDay, input.startsAt, input.endsAt)
      : null;
  };

  /**
   * 入力欄で直した日時を下書き（見出しとグリッドの枠）へ映す。
   * 予定は枠に出せない範囲なら、タスクは開始が空なら枠に置けないので、そのままにする
   */
  const syncDraft = () => {
    if (times) {
      const input = readInput();
      const next = input && taskDraftFromInput(input);
      if (next) onChangeDraft(next);
      return;
    }
    const next = eventRangeFromForm();
    if (next) onChangeDraft({ range: next });
  };

  return {
    formRef: form.formRef,
    form,
    initial,
    rangeText: times ? taskDraftText(placed) : draftText(range),
    allDay,
    changeAllDay: times
      ? setTaskAllDay
      : // 予定の終日は下書きそのものを切り替える（入力欄で直していた日時を保ったまま）
        (next: boolean) =>
          onChangeDraft({ range: withAllDay(eventRangeFromForm() ?? range, next) }),
    syncDraft,
    switchKind: (kind: EventKind) => {
      syncDraft();
      onSwitchKind(kind);
    },
    /** 入力済みのタイトルと参加者を既定値に重ねたもの。PC の吹き出しから全項目のフォームへ引き継ぐ */
    expandValues: (): ItemFormValues => {
      const input = readInput();
      return input
        ? { ...initial, title: input.title, participantIds: input.participantIds }
        : initial;
    },
  };
}
