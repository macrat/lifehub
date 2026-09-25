import { EventExtraFields, EventWhenFields } from '../../events/components/EventFields.tsx';
import { useQuickEventForm } from '../use-quick-event-form.ts';
import { QuickForm, type QuickProps } from './QuickForm.tsx';

/**
 * 選んだ範囲に予定を入れるための入力。予定の追加はグリッドをなぞっても追加ボタンからでもここへ来る。
 * 予定を長押しでつまんで直しているとき（`draft.item`）も同じ入力で、既定値がその予定の内容になるだけ。
 * 状態と操作は `useQuickEventForm` が持ち、入れ物（スマホのシート・PC の吹き出し）は `QuickForm`。
 * ここは上の段に出す予定の項目（日時・場所・メモ・繰り返し・通知）を渡すだけ。
 */
export function QuickEventForm({
  onChangeParticipants,
  onChangeInset,
  onExpand,
  ...props
}: QuickProps) {
  const quick = useQuickEventForm(props);
  const { draft } = props;
  const { initial, form } = quick;
  return (
    <QuickForm
      draft={draft}
      quick={quick}
      onChangeParticipants={onChangeParticipants}
      onExpand={onExpand}
      onClose={props.onClose}
      onChangeInset={onChangeInset}
      details={
        <>
          <EventWhenFields
            // グリッドの端をつまんで範囲を変えたら、入力欄もその日時に入れ直す
            key={`${initial.startsAt}|${initial.endsAt}`}
            initial={initial}
            errors={form.errors}
            allDay={draft.range.allDay}
            onChangeAllDay={quick.changeAllDay}
          />
          <EventExtraFields
            initial={initial}
            errors={form.errors}
            allDay={draft.range.allDay}
            thisOnly={form.thisOnly}
          />
        </>
      }
    />
  );
}
