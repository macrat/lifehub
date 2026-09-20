import AddIcon from '@mui/icons-material/Add';
import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';

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
      sx={{
        position: 'fixed',
        right: 16,
        bottom: { xs: 'calc(56px + env(safe-area-inset-bottom) + 16px)', md: 24 },
      }}
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
