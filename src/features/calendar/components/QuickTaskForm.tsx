import { TaskExtraFields, TaskWhenFields } from '../../events/components/EventFields.tsx';
import type { ItemFormValues } from '../../events/form-values.ts';
import type { CreateEventBody } from '../../events/queries.ts';
import type { EventDraft } from '../draft.ts';
import type { TaskItem } from '../task-draft.ts';
import type { GridDraft } from '../use-event-composer.ts';
import { useQuickTaskForm } from '../use-quick-task-form.ts';
import { QuickForm } from './QuickForm.tsx';

type Props = {
  /** グリッドの枠。つまんだタスクをどこへ動かしたか */
  draft: GridDraft;
  /** 直しているタスク（`draft.item`） */
  task: TaskItem;
  onChangeParticipants: (participantIds: string[]) => void;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  /** 上の段で直した日時を枠とタスクへ戻す */
  onChangeDraft: (draft: EventDraft, item: TaskItem) => void;
  /** PC の「その他のオプション」: 入力済みの内容を引き継いで全項目のフォームへ */
  onExpand: (values: ItemFormValues) => void;
  onClose: () => void;
  onChangeInset: (inset: number) => void;
};

/**
 * 長押しでつまんで動かしたタスクの入力。予定のクイック入力（`QuickEventForm`）と同じ入れ物（`QuickForm`）で、
 * スマホでは画面の下半分のシート（下の段はタイトル・日時の見出し・参加者だけ）から始まり、
 * 上の段まで広げるとタスクの全項目（終日・開始・期限・場所・メモ・繰り返し・通知）になる。
 * 下の段では後ろのグリッドを触れるので、シートを開いたまま枠をつまんで動かし直せる。
 */
export function QuickTaskForm({ onChangeParticipants, onChangeInset, ...props }: Props) {
  const quick = useQuickTaskForm(props);
  const { initial, form } = quick;
  return (
    <QuickForm
      draft={props.draft}
      quick={quick}
      onChangeParticipants={onChangeParticipants}
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
