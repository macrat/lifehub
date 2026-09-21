import AddIcon from '@mui/icons-material/Add';
import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
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

type Props = {
  /** 出す順（SpeedDial は下から上に開くので、先頭が一番下） */
  kinds: AddKind[];
  /** 予定・タスクの初期日付。無ければ今 */
  date?: DateString;
};

/** 右下の追加ボタン。選んだ種類のフォームをその場で開く。ホームは 4 種、カレンダーは予定・タスクだけ。 */
export function AddMenu({ kinds, date }: Props) {
  const [open, setOpen] = useState<AddKind | null>(null);
  const createEvent = useCreateEvent();
  const addExpense = useAddExpense();
  const logCare = useLogCare();
  const close = () => setOpen(null);

  return (
    <>
      {/* transition.appear を切って、マウント時のズームを止める。タブを移動するたびに
          FAB が出現し直して見えるため。hidden を切り替えたときだけアニメーションする */}
      <SpeedDial
        ariaLabel="追加"
        icon={<SpeedDialIcon icon={<AddIcon />} />}
        slotProps={{ transition: { appear: false } }}
        sx={FAB_SX}
      >
        {kinds.map((kind) => {
          const { label, icon: Icon } = ACTIONS[kind];
          return (
            <SpeedDialAction
              key={kind}
              icon={<Icon />}
              slotProps={{ tooltip: { title: label } }}
              onClick={() => setOpen(kind)}
            />
          );
        })}
      </SpeedDial>
      {open === 'event' && (
        <EventForm
          title="予定を追加"
          initial={defaultEventValues(date)}
          onSubmit={createEvent.mutateAsync}
          onClose={close}
        />
      )}
      {open === 'task' && (
        <TaskForm
          title="タスクを追加"
          initial={defaultTaskValues(date)}
          onSubmit={createEvent.mutateAsync}
          onClose={close}
        />
      )}
      {open === 'expense' && <ExpenseForm onSubmit={addExpense.mutateAsync} onClose={close} />}
      {open === 'lemon' && <CareLogForm onSubmit={logCare.mutateAsync} onClose={close} />}
    </>
  );
}
