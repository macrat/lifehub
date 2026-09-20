import { EventDetailDialog } from '../../events/components/EventDetailDialog.tsx';
import { TaskDetailDialog } from '../../tasks/components/TaskDetailDialog.tsx';
import type { CalendarItem } from '../queries.ts';

type Props = {
  item: CalendarItem | null;
  onClose: () => void;
};

/** 選択した項目の種別に応じた詳細ダイアログ */
export function ItemDialogs({ item, onClose }: Props) {
  return (
    <>
      <EventDetailDialog item={item?.kind === 'event' ? item : null} onClose={onClose} />
      <TaskDetailDialog item={item?.kind === 'task' ? item : null} onClose={onClose} />
    </>
  );
}
