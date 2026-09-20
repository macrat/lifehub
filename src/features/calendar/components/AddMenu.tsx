import AddIcon from '@mui/icons-material/Add';
import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import { FAB_SX } from '../../../lib/ui/AppShell.tsx';

type Props = {
  onAddEvent: () => void;
  onAddTask: () => void;
};

/** 右下の追加ボタン。予定とタスクのどちらを追加するか選ぶ。 */
export function AddMenu({ onAddEvent, onAddTask }: Props) {
  return (
    <SpeedDial
      ariaLabel="追加"
      icon={<SpeedDialIcon icon={<AddIcon />} />}
      FabProps={{ size: 'medium' }}
      sx={FAB_SX}
    >
      <SpeedDialAction
        icon={<ChecklistIcon />}
        slotProps={{ tooltip: { title: 'タスク' } }}
        onClick={onAddTask}
      />
      <SpeedDialAction
        icon={<EventIcon />}
        slotProps={{ tooltip: { title: '予定' } }}
        onClick={onAddEvent}
      />
    </SpeedDial>
  );
}
