import AddIcon from '@mui/icons-material/Add';
import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import { useState } from 'react';
import { FAB_SX } from '../../../lib/ui/AppShell.tsx';
import { defaultEventValues, EventForm } from '../../events/components/EventForm.tsx';
import { useCreateEvent } from '../../events/queries.ts';
import { ExpenseForm } from '../../expenses/components/ExpenseForm.tsx';
import { useAddExpense } from '../../expenses/queries.ts';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { useLogCare } from '../../lemon/queries.ts';
import { defaultTaskValues, TaskForm } from '../../tasks/components/TaskForm.tsx';
import { useCreateTask } from '../../tasks/queries.ts';

type Kind = 'event' | 'task' | 'expense' | 'lemon';

/** ホームのクイック追加。予定・タスク・立替・レモンの 4 種のフォームをその場で開く。 */
export function QuickAddMenu() {
  const [open, setOpen] = useState<Kind | null>(null);
  const createEvent = useCreateEvent();
  const createTask = useCreateTask();
  const addExpense = useAddExpense();
  const logCare = useLogCare();
  const close = () => setOpen(null);

  return (
    <>
      <SpeedDial
        ariaLabel="記録を追加"
        icon={<SpeedDialIcon icon={<AddIcon />} />}
        FabProps={{ size: 'medium' }}
        sx={FAB_SX}
      >
        <SpeedDialAction
          icon={<SpaIcon />}
          slotProps={{ tooltip: { title: 'レモン' } }}
          onClick={() => setOpen('lemon')}
        />
        <SpeedDialAction
          icon={<PaymentsIcon />}
          slotProps={{ tooltip: { title: '立替' } }}
          onClick={() => setOpen('expense')}
        />
        <SpeedDialAction
          icon={<ChecklistIcon />}
          slotProps={{ tooltip: { title: 'タスク' } }}
          onClick={() => setOpen('task')}
        />
        <SpeedDialAction
          icon={<EventIcon />}
          slotProps={{ tooltip: { title: '予定' } }}
          onClick={() => setOpen('event')}
        />
      </SpeedDial>
      {open === 'event' && (
        <EventForm
          title="予定を追加"
          initial={defaultEventValues()}
          onSubmit={(i) => createEvent.mutateAsync(i)}
          onClose={close}
        />
      )}
      {open === 'task' && (
        <TaskForm
          title="タスクを追加"
          initial={defaultTaskValues()}
          onSubmit={(i) => createTask.mutateAsync(i)}
          onClose={close}
        />
      )}
      {open === 'expense' && (
        <ExpenseForm onSubmit={(i) => addExpense.mutateAsync(i)} onClose={close} />
      )}
      {open === 'lemon' && <CareLogForm onSubmit={(i) => logCare.mutateAsync(i)} onClose={close} />}
    </>
  );
}
