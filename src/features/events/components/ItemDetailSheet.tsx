import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import UndoIcon from '@mui/icons-material/Undo';
import { useState } from 'react';
import { type RecordAction, RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { CalendarItem } from '../queries.ts';
import { useItemDetail } from '../use-item-detail.ts';
import { EventFormFields, ScopeChip, TaskFormFields } from './EventFields.tsx';
import { ItemCreateForm } from './ItemCreateForm.tsx';
import { ItemDetailView } from './ItemDetailView.tsx';
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog.tsx';

type Props = {
  item: CalendarItem;
  /** 開いた時点から入力欄にするか（一覧の行を長押しで開いたとき。繰り返しならまず範囲を選ばせる） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * 予定・タスクの詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーから複製・削除（タスクは完了も）する。
 * 複製は同じ内容を初期値にした追加のフォーム（`ItemCreateForm`）を、詳細の代わりに画面いっぱいで開く。
 * 開いている回の値（繰り返しなら繰り返しの設定も）をそのまま写し、完了は状態なので引き継がない。
 * 複製のフォームを閉じれば詳細ごと閉じる。複製している間は詳細（`useItemDetail`）をマウントしない。
 * 繰り返しなら編集・削除の前に範囲（この回だけ／これ以降／すべて）を選ばせる。
 * 詳細の状態と操作は `useItemDetail` に集約し、ここが持つのは詳細と複製のどちらを出すかだけ。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function ItemDetailSheet(props: Props) {
  const [duplicating, setDuplicating] = useState(false);
  return duplicating ? (
    <ItemCreateForm kind={props.item.kind} initial={props.item} onClose={props.onClose} />
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
  const detail = useItemDetail(item, initialEditing, onClose);
  const { form, completed, fields } = detail;

  const actions: RecordAction[] = [
    ...(item.kind === 'task'
      ? [
          {
            label: completed ? '完了を取り消す' : '完了にする',
            icon: completed ? <UndoIcon /> : <CheckCircleOutlineIcon />,
            onClick: detail.toggleCompletion,
          },
        ]
      : []),
    { label: '複製', icon: <ContentCopyIcon />, onClick: onDuplicate },
    { label: '削除', icon: <DeleteIcon />, danger: true, onClick: detail.startDelete },
  ];

  return (
    <>
      <RecordSheet
        title={item.title}
        struck={completed}
        {...form.sheet}
        onClose={onClose}
        editing={fields !== null}
        onEdit={detail.startEdit}
        actions={actions}
      >
        {fields ? (
          <>
            {detail.editScope && <ScopeChip scope={detail.editScope} />}
            {item.kind === 'task' ? (
              <TaskFormFields {...fields} autoFocus={false} />
            ) : (
              <EventFormFields {...fields} />
            )}
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
