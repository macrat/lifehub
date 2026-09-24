import { useRef, useState } from 'react';
import type { SheetDetent } from '../../lib/ui/BottomSheet.tsx';
import type { ItemFormValues } from '../events/form-values.ts';
import type { CreateEventBody } from '../events/queries.ts';
import { grabbedScope } from '../events/recurrence-options.ts';
import { useItemForm } from '../events/use-item-form.ts';
import {
  draftFromInstants,
  draftInstants,
  draftValues,
  type EventDraft,
  withAllDay,
} from './draft.ts';
import type { GridDraft } from './use-event-composer.ts';

type Options = {
  draft: GridDraft;
  isMobile: boolean;
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
export function useQuickEventForm({
  draft,
  isMobile,
  onSubmit,
  onChangeDraft,
  onExpand,
  onClose,
}: Options) {
  const { range, item, participantIds } = draft;
  const formRef = useRef<HTMLFormElement>(null);
  // 段はスマホのシートだけのもの。PC の吹き出しは広がらないので、常に下の段と同じ中身を出す
  const [detent, setDetent] = useState<SheetDetent>(isMobile ? draft.detent : 'peek');
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
    detent,
    /** 段の移動。下の段に戻るときは、上の段で直した日時を下書き（テキストとグリッドの枠）へ映す */
    changeDetent: (next: SheetDetent) => {
      const range = next === 'peek' ? draftFromForm() : null;
      if (range) onChangeDraft(range);
      setDetent(next);
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
