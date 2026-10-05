import { useState } from 'react';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { useCreateEvent } from '../queries.ts';
import { useItemDetail } from '../use-item-detail.tsx';
import { ItemDetailView } from './ItemDetailView.tsx';
import { ItemFields, ScopeChip } from './ItemFields.tsx';
import { ItemForm } from './ItemForm.tsx';
import { KindToggle } from './KindToggle.tsx';
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog.tsx';

type Props = {
  item: CalendarItem;
  /** 開いた時点から入力欄にするか（一覧の行を長押しで開いたとき。繰り返しならまず範囲を選ばせる） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * 予定・タスクの詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーから複製・削除（タスクは完了も）する。
 * 入力欄の上端の切り替えで、予定をタスクに（タスクを予定に）変えて保存できる（繰り返しの 1 回だけのときは出さない）。
 * 複製は同じ内容を初期値にした全項目のフォーム（`ItemForm`）を、詳細の代わりに画面いっぱいで開き、新規作成として保存する。
 * 開いている回の値（繰り返しなら繰り返しの設定も）をそのまま写し、完了は状態なので引き継がない。
 * 複製のフォームを閉じれば詳細ごと閉じる。複製している間は詳細（`useItemDetail`）をマウントしない。
 * 繰り返しなら編集・削除の前に範囲（この回だけ／これ以降／すべて）を選ばせる。
 * 詳細の状態と操作は `useItemDetail` に集約し、ここが持つのは詳細と複製のどちらを出すかだけ。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function ItemDetailSheet(props: Props) {
  const [duplicating, setDuplicating] = useState(false);
  const createEvent = useCreateEvent();
  return duplicating ? (
    <ItemForm initial={props.item} onSubmit={createEvent.mutateAsync} onClose={props.onClose} />
  ) : (
    <ItemDetail {...props} onDuplicate={() => setDuplicating(true)} />
  );
}

function ItemDetail({
  item,
  initialEditing = false,
  onClose,
  onDuplicate,
}: Props & { onDuplicate: () => void }) {
  const detail = useItemDetail(item, initialEditing, onClose, onDuplicate);
  const { form, completed, fields } = detail;

  return (
    <>
      <RecordSheet
        title={item.title}
        struck={completed}
        {...form.sheet}
        onClose={onClose}
        editing={fields !== null}
        onEdit={detail.startEdit}
        actions={detail.actions}
        headerMiddle={
          fields && (
            <KindToggle
              kind={fields.initial.kind}
              thisOnly={fields.thisOnly}
              onChange={detail.switchKind}
            />
          )
        }
      >
        {fields ? (
          <>
            {detail.editScope && <ScopeChip scope={detail.editScope} />}
            <ItemFields {...fields} />
          </>
        ) : (
          <ItemDetailView item={item} />
        )}
      </RecordSheet>

      {detail.pendingScope && (
        <RecurrenceScopeDialog
          action={detail.pendingScope}
          onSelect={detail.selectScope}
          onClose={detail.cancelScope}
        />
      )}
    </>
  );
}
