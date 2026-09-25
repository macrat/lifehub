import { EventExtraFields, EventWhenFields } from '../../events/components/EventFields.tsx';
import type { ItemFormValues } from '../../events/form-values.ts';
import type { CreateEventBody } from '../../events/queries.ts';
import type { EventDraft } from '../draft.ts';
import type { GridDraft } from '../use-event-composer.ts';
import { useQuickEventForm } from '../use-quick-event-form.ts';
import { QuickForm } from './QuickForm.tsx';

type Props = {
  /**
   * グリッドの下書き。範囲（`range`）は日時の既定値になり、上の段で直すとここへ戻す。
   * `item` は直している保存済みの予定（長押しでつまんだもの。追加のときは null）で、入力の既定値になり、
   * 保存は呼び出し側（`onSubmit`）が上書きに振り分ける。
   */
  draft: GridDraft;
  onChangeParticipants: (participantIds: string[]) => void;
  /** 検証を通った値の保存。結果は待つが、画面には楽観的更新で先に反映されている */
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  /** 上の段で直した日時・終日の切り替えを下書き（グリッドの枠）へ戻す */
  onChangeDraft: (draft: EventDraft) => void;
  /** PC の「その他のオプション」: 入力済みの内容を引き継いで全項目のフォームへ */
  onExpand: (values: ItemFormValues) => void;
  onClose: () => void;
  /** シートがカレンダーを下から覆っている高さ（px）が変わったとき */
  onChangeInset: (inset: number) => void;
};

/**
 * 選んだ範囲に予定を入れるための入力。予定の追加はグリッドをなぞっても追加ボタンからでもここへ来る。
 * 予定を長押しでつまんで直しているとき（`item`）も同じ入力で、既定値がその予定の内容になるだけ。
 * 状態と操作は `useQuickEventForm` が持ち、入れ物（スマホのシート・PC の吹き出し）は `QuickForm`。
 * ここは上の段に出す予定の項目（日時・場所・メモ・繰り返し・通知）を渡すだけ。
 */
export function QuickEventForm({ onChangeParticipants, onChangeInset, ...props }: Props) {
  const quick = useQuickEventForm(props);
  const { draft } = props;
  const { initial, form } = quick;
  return (
    <QuickForm
      draft={draft}
      quick={quick}
      onChangeParticipants={onChangeParticipants}
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
