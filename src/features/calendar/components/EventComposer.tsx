import { ItemForm } from '../../events/components/ItemForm.tsx';
import { grabbedScope } from '../../events/recurrence-options.ts';
import type { useEventComposer } from '../use-event-composer.ts';
import { QuickItemForm } from './QuickItemForm.tsx';

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
 * 種類はクイック入力で選んでいたもの（長押しでつまんだタスクならタスクから始まる）で、全項目のフォームへも持ち越す。
 */
export function EventComposer({ composer, onClose, onChangeInset }: Props) {
  const { draft, expanded } = composer;
  if (draft) {
    return (
      <QuickItemForm
        draft={draft}
        onChangeParticipants={composer.changeParticipants}
        onSubmit={composer.save}
        onChangeDraft={composer.changeDraft}
        onSwitchKind={composer.switchKind}
        onExpand={composer.expand}
        onClose={onClose}
        onChangeInset={onChangeInset}
      />
    );
  }
  if (expanded) {
    return (
      <ItemForm
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
