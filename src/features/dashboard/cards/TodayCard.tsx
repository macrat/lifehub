import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { formatTime, toDateString } from '../../../lib/date.ts';
import { useOnline } from '../../../lib/online.ts';
import { ItemDialogs } from '../../calendar/components/ItemDialogs.tsx';
import { itemKey } from '../../calendar/components/lane-layout.ts';
import type { CalendarItem } from '../../calendar/queries.ts';
import { useToggleTaskCompletion } from '../../tasks/queries.ts';
import { useUserColor } from '../../users/use-user-color.ts';
import type { DashboardCardOf } from '../queries.ts';
import { SectionHeading } from './DashboardCardFrame.tsx';

/**
 * 今日の予定とタスクを 1 つの一覧に。1 項目 1 行（印・時刻・タイトルだけ）で、名前や終了時刻は出さない。
 * タスクはチェックで完了、行をタップすると詳細。
 */
export function TodayCard({ card }: { card: DashboardCardOf<'today'> }) {
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const navigate = useNavigate();
  return (
    <Box component="section" sx={{ py: 1 }}>
      <SectionHeading
        title="今日"
        onClick={() => navigate({ to: '/calendar', search: { view: 'day' } })}
      />
      {card.data.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ px: 2 }}>
          なし
        </Typography>
      ) : (
        card.data.map((item) => <TodayRow key={itemKey(item)} item={item} onClick={setSelected} />)
      )}
      <ItemDialogs item={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}

function TodayRow({
  item,
  onClick,
}: {
  item: CalendarItem;
  onClick: (item: CalendarItem) => void;
}) {
  const colorFor = useUserColor();
  const toggle = useToggleTaskCompletion();
  const online = useOnline();
  const isTask = item.kind === 'task';
  const colors = colorFor(isTask ? item.assigneeUserId : item.ownerUserId);
  return (
    <Stack direction="row" sx={{ alignItems: 'center', minHeight: 36 }}>
      <Box sx={{ width: 44, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        {isTask ? (
          <Checkbox
            size="small"
            checked={false}
            disabled={toggle.isPending || !online}
            onChange={() =>
              toggle.mutate({ id: item.id, occurrenceKey: item.occurrenceKey, completed: true })
            }
            slotProps={{ input: { 'aria-label': `${item.title} を完了にする` } }}
            sx={{ p: 0.5, color: colors.fill, '&.Mui-checked': { color: colors.fill } }}
          />
        ) : (
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colors.fill }} />
        )}
      </Box>
      <ButtonBase
        onClick={() => onClick(item)}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          justifyContent: 'flex-start',
          textAlign: 'left',
          py: 0.5,
          pr: 2,
          gap: 1.5,
          borderRadius: 1,
        }}
      >
        <Typography
          variant="body2"
          component="span"
          color={isTask && item.isOverdue ? 'error' : 'text.secondary'}
          sx={{ width: 44, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
        >
          {timeLabel(item)}
        </Typography>
        <Typography noWrap sx={{ minWidth: 0 }}>
          {item.title}
        </Typography>
      </ButtonBase>
    </Stack>
  );
}

/** 予定は開始時刻（終日・複数日は「終日」）、タスクは今日の期限か開始の時刻。それ以外は空 */
function timeLabel(item: CalendarItem): string {
  if (item.kind === 'event')
    return item.allDay || item.dayCount > 1 ? '終日' : formatTime(item.startsAt);
  const instant = item.dueAt ?? item.startsAt;
  if (!instant || toDateString(new Date(instant)) !== item.placementDate) return '';
  return formatTime(instant);
}
