import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { ADD_KINDS } from '../../../lib/add-kinds.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { useAllDay, useItemForm, useKindSwitch } from '../use-item-form.ts';
import { ItemFields } from './ItemFields.tsx';
import { KindToggle } from './KindToggle.tsx';

type Props = {
  /** 入力の既定値。種類も持ち、上端の切り替え（`KindToggle`）で入力の途中から変えられる */
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

/**
 * 予定・タスクの全項目のフォーム。複製（`ItemDetailSheet`）のほか、クイック入力の「その他のオプション」から
 * 直し続けるときもここへ来る（何を保存するかは `onSubmit` を渡す側が決める）。詳細から開く編集は `ItemDetailSheet`。
 * 予定は開始・終了、タスクは開始だけを持ち、どちらも必須。通知はどちらも開始前だけを扱う。
 * 予定とタスクは上端の切り替えで入れ替えられる（繰り返しの 1 回だけを直しているときは出さない）。
 */
export function ItemForm(props: Props) {
  const { scope, editing = false, onSubmit, onClose } = props;
  const { initial, switchTo } = useKindSwitch(props.initial);
  const { kind } = initial;
  const [allDay, setAllDay] = useAllDay(initial.allDay, initial);
  const { thisOnly, errors, sheet, readInput } = useItemForm({
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
      title={`${ADD_KINDS[kind].label}を${editing ? '編集' : '追加'}`}
      headerMiddle={
        <KindToggle kind={kind} thisOnly={thisOnly} onChange={(to) => switchTo(to, readInput())} />
      }
    >
      <ItemFields
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
