import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import UndoIcon from '@mui/icons-material/Undo';
import { type RecordAction, RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import type { CalendarItem } from '../queries.ts';
import { useItemDetail } from '../use-item-detail.ts';
import { EventFormFields, ScopeChip, TaskFormFields } from './EventFields.tsx';
import { EventForm } from './EventForm.tsx';
import { ItemDetailView } from './ItemDetailView.tsx';
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog.tsx';
import { TaskForm } from './TaskForm.tsx';

type Props = {
  item: CalendarItem;
  /** 開いた時点から入力欄にするか（一覧の行を長押しで開いたとき。繰り返しならまず範囲を選ばせる） */
  initialEditing?: boolean;
  onClose: () => void;
};

/**
 * 予定・タスクの詳細。鉛筆で同じシートの中が入力欄に変わり、三点リーダーから複製・削除（タスクは完了も）する。
 * 複製は同じ内容を初期値にした追加のフォーム（`EventForm` / `TaskForm`）を、詳細の代わりに画面いっぱいで開く。
 * 繰り返しなら編集・削除の前に範囲（この回だけ／これ以降／すべて）を選ばせる。
 * 状態と操作は `useItemDetail` に集約し、ここは表示と操作の受け渡しに徹する。
 * 呼び出し側が項目を選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 */
export function ItemDetailSheet({ item, initialEditing = false, onClose }: Props) {
  const detail = useItemDetail(item, initialEditing, onClose);
  const { form, completed, fields, duplicate } = detail;

  if (duplicate) {
    return item.kind === 'task' ? (
      <TaskForm initial={duplicate.initial} onSubmit={duplicate.save} onClose={onClose} />
    ) : (
      <EventForm initial={duplicate.initial} onSubmit={duplicate.save} onClose={onClose} />
    );
  }

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
    { label: '複製', icon: <ContentCopyIcon />, onClick: detail.startDuplicate },
    { label: '削除', icon: <DeleteIcon />, danger: true, onClick: detail.startDelete },
  ];

  return (
    <>
      <RecordSheet
        title={item.title}
        struck={completed}
        open={!form.submitted}
        onClose={onClose}
        editing={fields !== null}
        onEdit={detail.startEdit}
        actions={actions}
        onSubmit={form.handleSubmit}
        error={form.submitError}
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
