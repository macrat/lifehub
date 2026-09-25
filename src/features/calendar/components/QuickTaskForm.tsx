import { TaskExtraFields, TaskWhenFields } from '../../events/components/EventFields.tsx';
import type { QuickProps, TaskGridDraft } from '../use-event-composer.ts';
import { useQuickTaskForm } from '../use-quick-task-form.ts';
import { QuickForm } from './QuickForm.tsx';

/**
 * 長押しでつまんで動かしたタスクの入力。予定のクイック入力（`QuickEventForm`）と同じ入れ物（`QuickForm`）で、
 * スマホでは画面の下半分のシート（下の段はタイトル・日時の見出し・参加者だけ）から始まり、
 * 上の段まで広げるとタスクの全項目（終日・開始・期限・場所・メモ・繰り返し・通知）になる。
 * 下の段では後ろのグリッドを触れるので、シートを開いたまま枠をつまんで動かし直せる。
 */
export function QuickTaskForm({
  onChangeParticipants,
  onChangeInset,
  onExpand,
  ...props
}: Omit<QuickProps, 'draft'> & { draft: TaskGridDraft }) {
  const quick = useQuickTaskForm(props);
  const { initial, form } = quick;
  return (
    <QuickForm
      draft={props.draft}
      quick={quick}
      onChangeParticipants={onChangeParticipants}
      onExpand={onExpand}
      onClose={props.onClose}
      onChangeInset={onChangeInset}
      details={
        <>
          <TaskWhenFields
            // 枠を動かしたら、入力欄もその日時に入れ直す
            key={`${initial.startsAt}|${initial.endsAt}`}
            initial={initial}
            errors={form.errors}
            allDay={quick.allDay}
            onChangeAllDay={quick.changeAllDay}
          />
          <TaskExtraFields
            initial={initial}
            errors={form.errors}
            allDay={quick.allDay}
            thisOnly={form.thisOnly}
          />
        </>
      }
    />
  );
}
