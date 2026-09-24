import { EventForm } from '../../events/components/EventForm.tsx';
import { grabbedScope } from '../../events/recurrence-options.ts';
import type { useEventComposer } from '../use-event-composer.ts';
import { QuickEventForm } from './QuickEventForm.tsx';

type Props = {
  composer: ReturnType<typeof useEventComposer>;
  /** 入力を閉じた（保存でも取り消しでも） */
  onClose: () => void;
  /** クイック入力のシートがカレンダーを下から覆っている高さ（px）が変わったとき */
  onChangeInset: (inset: number) => void;
};

/**
 * 予定の入力。グリッドの下書きにはクイック入力を、「その他のオプション」で移した後は全項目のフォームを出す。
 * 同時に開くのはどちらか 1 つ（`useEventComposer` の状態がそれを守る）。
 */
export function EventComposer({ composer, onClose, onChangeInset }: Props) {
  const { draft, expanded } = composer;
  if (draft) {
    return (
      <QuickEventForm
        draft={draft}
        onChangeParticipants={composer.changeParticipants}
        onSubmit={composer.save}
        onChangeDraft={composer.changeRange}
        onExpand={composer.expand}
        onClose={onClose}
        onChangeInset={onChangeInset}
      />
    );
  }
  if (expanded) {
    return (
      <EventForm
        initial={expanded.values}
        scope={grabbedScope(expanded.item)}
        title={expanded.item ? '予定を編集' : '予定を追加'}
        onSubmit={composer.save}
        onClose={onClose}
      />
    );
  }
  return null;
}
