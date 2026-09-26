import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { useAllDay, useItemForm } from '../use-item-form.ts';
import { ItemFields } from './EventFields.tsx';

type Props = {
  kind: 'event' | 'task';
  initial: ItemFormValues;
  /** this のときは繰り返しの設定は変更できない（回の行は繰り返さない） */
  scope?: RecurrenceScope;
  /**
   * 既にある予定・タスクを直しているか（カレンダーでつまんだもののクイック入力から来たとき）。
   * 見出しが「編集」になり、タスクでもタイトルに焦点を当てない（焦点はタスクの追加だけ。`ItemFields`）
   */
  editing?: boolean;
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  onClose: () => void;
};

const NOUNS = { event: '予定', task: 'タスク' } as const;

/**
 * 予定・タスクの全項目のフォーム。追加（`ItemCreateForm`）のほか、クイック入力の「その他のオプション」から
 * 直し続けるときもここへ来る（何を保存するかは `onSubmit` を渡す側が決める）。詳細から開く編集は `ItemDetailSheet`。
 * 予定は開始・終了が必須で、通知は開始前だけを扱う。タスクは開始・期限がどちらも任意で、通知は「開始に」「期限に」の 2 択。
 */
export function ItemForm({ kind, initial, scope, editing = false, onSubmit, onClose }: Props) {
  const [allDay, setAllDay] = useAllDay(initial);
  const { thisOnly, errors, sheet } = useItemForm({
    kind,
    initial,
    allDay,
    scope,
    onSubmit,
    onSaved: onClose,
  });

  return (
    <RecordSheet
      {...sheet}
      onClose={onClose}
      full
      title={`${NOUNS[kind]}を${editing ? '編集' : '追加'}`}
    >
      <ItemFields
        kind={kind}
        initial={initial}
        errors={errors}
        allDay={allDay}
        onChangeAllDay={setAllDay}
        thisOnly={thisOnly}
        autoFocus={kind === 'task' && !editing}
      />
    </RecordSheet>
  );
}
