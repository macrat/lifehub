import { EventForm } from '../../events/components/EventForm.tsx';
import { TaskForm } from '../../events/components/TaskForm.tsx';
import { grabbedScope } from '../../events/recurrence-options.ts';
import type { useEventComposer } from '../use-event-composer.ts';
import { QuickEventForm } from './QuickEventForm.tsx';
import { QuickTaskForm } from './QuickTaskForm.tsx';

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
 * 長押しでつまんだのがタスクなら、どちらもタスクの入力（`QuickTaskForm`・`TaskForm`）にする。
 */
export function EventComposer({ composer, onClose, onChangeInset }: Props) {
  const { draft, expanded } = composer;
  if (draft) {
    const common = {
      draft,
      onChangeParticipants: composer.changeParticipants,
      onSubmit: composer.save,
      onExpand: composer.expand,
      onClose,
      onChangeInset,
    };
    return draft.item?.kind === 'task' ? (
      <QuickTaskForm {...common} task={draft.item} onChangeDraft={composer.changeRange} />
    ) : (
      <QuickEventForm {...common} onChangeDraft={composer.changeRange} />
    );
  }
  if (expanded) {
    return expanded.item?.kind === 'task' ? (
      <TaskForm
        initial={expanded.values}
        scope={grabbedScope(expanded.item)}
        title="タスクを編集"
        autoFocus={false}
        onSubmit={composer.save}
        onClose={onClose}
      />
    ) : (
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
