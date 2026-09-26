import { ItemForm } from '../../events/components/ItemForm.tsx';
import { grabbedScope } from '../../events/recurrence-options.ts';
import { isTaskDraft, type useEventComposer } from '../use-event-composer.ts';
import { QuickEventForm, QuickTaskForm } from './QuickItemForm.tsx';

type Props = {
  composer: ReturnType<typeof useEventComposer>;
  /** 入力を閉じた（保存でも取り消しでも） */
  onClose: () => void;
  /** クイック入力のシートがカレンダーを下から覆っている高さ（px）が変わったとき */
  onChangeInset: (inset: number) => void;
};

/**
 * 予定・タスクの入力。グリッドの下書きにはクイック入力を、「その他のオプション」で移した後は全項目のフォームを出す。
 * 同時に開くのはどちらか 1 つ（`useEventComposer` の状態がそれを守る）。
 * 長押しでつまんだのがタスクなら、どちらもタスクの入力にする。
 */
export function EventComposer({ composer, onClose, onChangeInset }: Props) {
  const { draft, expanded } = composer;
  if (draft) {
    const common = {
      draft,
      onChangeParticipants: composer.changeParticipants,
      onSubmit: composer.save,
      onChangeDraft: composer.changeDraft,
      onExpand: composer.expand,
      onClose,
      onChangeInset,
    };
    return isTaskDraft(draft) ? (
      <QuickTaskForm {...common} draft={draft} />
    ) : (
      <QuickEventForm {...common} />
    );
  }
  if (expanded) {
    return (
      <ItemForm
        kind={expanded.item?.kind ?? 'event'}
        initial={expanded.values}
        scope={grabbedScope(expanded.item)}
        editing={expanded.item !== null}
        onSubmit={composer.save}
        onClose={onClose}
      />
    );
  }
  return null;
}
