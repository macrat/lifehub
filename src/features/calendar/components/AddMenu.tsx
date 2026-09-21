import AddIcon from '@mui/icons-material/Add';
import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import Backdrop from '@mui/material/Backdrop';
import SpeedDial, { speedDialClasses } from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import type { SxProps, Theme } from '@mui/material/styles';
import { useState } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import { FAB_SX } from '../../../lib/ui/AppShell.tsx';
import { EventForm } from '../../events/components/EventForm.tsx';
import { TaskForm } from '../../events/components/TaskForm.tsx';
import { defaultEventValues, defaultTaskValues } from '../../events/form-values.ts';
import { useCreateEvent } from '../../events/queries.ts';
import { ExpenseForm } from '../../expenses/components/ExpenseForm.tsx';
import { useAddExpense } from '../../expenses/queries.ts';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { useLogCare } from '../../lemon/queries.ts';

export type AddKind = 'event' | 'task' | 'expense' | 'lemon';

const ACTIONS: Record<AddKind, { label: string; icon: typeof EventIcon }> = {
  event: { label: '予定', icon: EventIcon },
  task: { label: 'タスク', icon: ChecklistIcon },
  expense: { label: '立替', icon: PaymentsIcon },
  lemon: { label: 'レモン', icon: SpaIcon },
};

/** スクリムと追加ボタンは AppBar・下部ナビ（drawer + 1）より上に出す。展開中は画面全体が暗くなる */
const SCRIM_Z = (t: Theme) => t.zIndex.drawer + 2;

const MENU_SX: SxProps<Theme> = {
  ...FAB_SX,
  zIndex: (t) => SCRIM_Z(t) + 1,
  // ラベルの長さが違っても右端は FAB に揃える（既定の中央揃え・幅揃えにしない）
  alignItems: 'flex-end',
  [`& .${speedDialClasses.actions}`]: { alignItems: 'flex-end' },
  // 展開すると角丸 16px の四角から円へ変わり、アイコンも + から × になる
  [`& .${speedDialClasses.fab}`]: {
    transition: 'border-radius .2s',
    '&[aria-expanded="true"]': { borderRadius: '50%' },
  },
};

/** ラベル付きの pill。SpeedDialAction 既定の背景（paper）はスクリムに沈むので、浮くグレーにする */
const PILL_SX: SxProps<Theme> = {
  gap: 1,
  // 既定の余白（8px）のうち右だけ削り、右端を FAB に揃える（上下は項目どうしの間隔として残す）
  mr: 0,
  bgcolor: 'grey.300',
  color: 'grey.900',
  '&:hover': { bgcolor: 'grey.A100' },
};

type Props = {
  /** 出す順（SpeedDial は下から上に開くので、先頭が一番下） */
  kinds: AddKind[];
  /** 予定・タスクの初期日付。無ければ今 */
  date?: DateString;
};

/**
 * 右下の追加ボタン。選んだ種類のフォームをその場で開く。ホームは 4 種、カレンダーは予定・タスクだけ。
 *
 * 展開したときの見た目は Google カレンダーに揃える: 背景をスクリムで暗くし、アイコンとラベルを収めた
 * pill を右揃えで縦に並べる。ラベルはツールチップではなくボタンの中に出すので、タッチでも読める。
 */
export function AddMenu({ kinds, date }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<AddKind | null>(null);
  const createEvent = useCreateEvent();
  const addExpense = useAddExpense();
  const logCare = useLogCare();
  const close = () => setForm(null);
  const collapse = () => setExpanded(false);

  return (
    <>
      <Backdrop open={expanded} onClick={collapse} sx={{ zIndex: SCRIM_Z }} />
      {/* transition.appear を切って、マウント時のズームを止める。タブを移動するたびに
          FAB が出現し直して見えるため。hidden を切り替えたときだけアニメーションする */}
      <SpeedDial
        ariaLabel="追加"
        icon={<SpeedDialIcon icon={<AddIcon />} />}
        open={expanded}
        onOpen={() => setExpanded(true)}
        onClose={collapse}
        slotProps={{ transition: { appear: false } }}
        sx={MENU_SX}
      >
        {kinds.map((kind) => {
          const { label, icon: Icon } = ACTIONS[kind];
          return (
            <SpeedDialAction
              key={kind}
              icon={
                <>
                  <Icon />
                  {label}
                </>
              }
              slotProps={{ fab: { variant: 'extended', size: 'medium', sx: PILL_SX } }}
              onClick={() => {
                collapse();
                setForm(kind);
              }}
            />
          );
        })}
      </SpeedDial>
      {form === 'event' && (
        <EventForm
          title="予定を追加"
          initial={defaultEventValues(date)}
          onSubmit={(i) => createEvent.mutateAsync(i)}
          onClose={close}
        />
      )}
      {form === 'task' && (
        <TaskForm
          title="タスクを追加"
          initial={defaultTaskValues(date)}
          onSubmit={(i) => createEvent.mutateAsync(i)}
          onClose={close}
        />
      )}
      {form === 'expense' && (
        <ExpenseForm onSubmit={(i) => addExpense.mutateAsync(i)} onClose={close} />
      )}
      {form === 'lemon' && <CareLogForm onSubmit={(i) => logCare.mutateAsync(i)} onClose={close} />}
    </>
  );
}
