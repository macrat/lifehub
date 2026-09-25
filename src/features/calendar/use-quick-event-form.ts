import { useRef } from 'react';
import type { ItemFormValues } from '../events/form-values.ts';
import type { CreateEventBody } from '../events/queries.ts';
import { grabbedScope } from '../events/recurrence-options.ts';
import { useItemForm } from '../events/use-item-form.ts';
import {
  draftFromInstants,
  draftInstants,
  draftText,
  draftValues,
  type EventDraft,
  withAllDay,
} from './draft.ts';
import type { GridDraft } from './use-event-composer.ts';

type Options = {
  draft: GridDraft;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onChangeDraft: (draft: EventDraft) => void;
  onExpand: (values: ItemFormValues) => void;
  onClose: () => void;
};

/**
 * クイック入力（`QuickEventForm`）の状態と操作。日時（終日かどうかを含む）は下書きの範囲（`draft.range`）
 * だけが持つ。入力で直した日時と終日の切り替えは下書きへ戻し、見出し・グリッドの枠・保存する日時が
 * いつも同じ下書きから決まるようにする（入力の側にも持つと、開いたままグリッドで別の種類の枠を
 * 選び直したときに食い違う）。
 */
export function useQuickEventForm({ draft, onSubmit, onChangeDraft, onExpand, onClose }: Options) {
  const { range, item, participantIds } = draft;
  const formRef = useRef<HTMLFormElement>(null);
  const initial = draftValues(range, participantIds, item);
  const form = useItemForm({
    kind: 'event',
    initial,
    allDay: range.allDay,
    // その回だけを直すときは、繰り返しの設定そのものは触らせない（回の行は繰り返さない）
    scope: grabbedScope(item),
    // PC の吹き出しには日時の入力欄が無いので、下書きの日時をそのまま保存する
    fallback: draftInstants(range),
    onSubmit,
    onSaved: onClose,
  });

  /** 入力欄の日時 → 下書き。枠に出せない範囲（日をまたぐ時間指定など）なら null */
  const draftFromForm = (): EventDraft | null => {
    if (!formRef.current) return null;
    const { allDay, startsAt, endsAt } = form.inputFromForm(new FormData(formRef.current));
    return startsAt && endsAt ? draftFromInstants(allDay, startsAt, endsAt) : null;
  };

  return {
    formRef,
    form,
    initial,
    title: initial.title,
    rangeText: draftText(range),
    /**
     * 入力欄で直した日時を下書き（見出しとグリッドの枠）へ映す。スマホのシートを下の段に戻すとき。
     * 枠に出せない範囲（日をまたぐ時間指定など）なら枠はそのままにする
     */
    syncDraft: () => {
      const range = draftFromForm();
      if (range) onChangeDraft(range);
    },
    /** 終日の切り替え。入力欄で直していた日時を保ったまま、下書きそのものを切り替える */
    changeAllDay: (allDay: boolean) => onChangeDraft(withAllDay(draftFromForm() ?? range, allDay)),
    /** PC だけ: 入力済みの内容を引き継いで全項目のフォームへ */
    expand: () => {
      const input = form.inputFromForm(new FormData(formRef.current ?? undefined));
      onExpand({ ...initial, title: input.title, participantIds: input.participantIds });
    },
  };
}
