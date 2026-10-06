import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { addMonths, firstDayOfMonth, today, toMonthString } from '../../../../shared/date.ts';
import type { DateString } from '../../../../shared/types.ts';
import { formatDateWithYear, formatMonth, weekdayLabelColor } from '../../../lib/date.ts';
import { Dialog } from '../../../lib/ui/Dialog.tsx';
import {
  formatWeekRange,
  monthGridDays,
  monthGridWeeks,
  WEEKDAY_LABELS,
  weekDays,
  weekStart,
} from '../calendar-dates.ts';
import { useCalendarDays } from '../queries.ts';
import type { PeriodView } from '../use-calendar-page.ts';
import { DayNumber } from './DayNumber.tsx';

/** 何を選ぶダイアログか（読み上げ用の名前）。開くボタンの文言（「年月を選ぶ」）とは言い回しが違う */
const PICKER_NAMES: Record<PeriodView, string> = {
  month: '年月の選択',
  week: '週の選択',
  day: '日付の選択',
};

type Props = {
  /** 選ぶ単位。表示している期間（月・週・日）と揃える */
  unit: PeriodView;
  /** 今表示している日 */
  date: DateString;
  /** 送っている月（"YYYY-MM"。画面が持ち、その月の祝日を購読する） */
  month: string;
  onChangeMonth: (month: string) => void;
  onClose: () => void;
  /** 選んだ月・週・日の最初の日 */
  onSelect: (date: DateString) => void;
};

const COLUMNS = 'repeat(7, minmax(0, 1fr))';

/**
 * 年月・週・日を選ぶダイアログ。AppBar の見出しをタップして開く。
 * 選択肢そのものが何を選ぶのかを示すので、見出しは置かない（名前は読み上げにだけ渡す）。
 * 見出しが指すものと選べるものを揃える: 月表示は年を ‹ › で送って 12 か月から、
 * 週・日表示は月を ‹ › で送って月グリッドの週・日から選ぶ。
 */
export function DatePickerDialog({
  unit,
  date,
  month,
  onChangeMonth: setMonth,
  onClose,
  onSelect,
}: Props) {
  // 選ぶ範囲が広い月表示は年ごと、週・日表示は月ごとに送る
  const step = unit === 'month' ? 12 : 1;
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth label={PICKER_NAMES[unit]}>
      <DialogContent sx={{ p: 2 }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
        >
          <IconButton
            aria-label={unit === 'month' ? '前の年' : '前の月'}
            onClick={() => setMonth(addMonths(month, -step))}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6" component="div">
            {unit === 'month' ? `${month.slice(0, 4)}年` : formatMonth(firstDayOfMonth(month))}
          </Typography>
          <IconButton
            aria-label={unit === 'month' ? '次の年' : '次の月'}
            onClick={() => setMonth(addMonths(month, step))}
          >
            <ChevronRightIcon />
          </IconButton>
        </Stack>
        {unit === 'month' ? (
          <MonthOptions month={month} selected={toMonthString(date)} onSelect={onSelect} />
        ) : (
          <DayOptions unit={unit} month={month} selected={date} onSelect={onSelect} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 1 年の 12 か月。選択中は塗り、今月は枠で示す */
function MonthOptions({
  month,
  selected,
  onSelect,
}: {
  month: string;
  selected: string;
  onSelect: (date: DateString) => void;
}) {
  const thisMonth = toMonthString(today());
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
      {Array.from({ length: 12 }, (_, i) => {
        const value = `${month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`;
        const isSelected = value === selected;
        const isThisMonth = value === thisMonth;
        return (
          <Button
            key={value}
            variant={isSelected ? 'contained' : isThisMonth ? 'outlined' : 'text'}
            color={isSelected || isThisMonth ? 'primary' : 'inherit'}
            onClick={() => onSelect(firstDayOfMonth(value))}
            sx={{ py: 1.25 }}
          >
            {i + 1}月
          </Button>
        );
      })}
    </Box>
  );
}

/**
 * 月表示と同じ月グリッド（月曜始まり 6 週）から週・日を選ぶ。
 * 週表示では 1 週がまるごと 1 つのボタン、日表示では 1 日ずつがボタン。今表示している週・日は背景で示す。
 */
function DayOptions({
  unit,
  month,
  selected,
  onSelect,
}: {
  unit: Exclude<PeriodView, 'month'>;
  month: string;
  selected: DateString;
  onSelect: (date: DateString) => void;
}) {
  // 祝日はカレンダーの面と同じ月のキャッシュから読む。選んだ先の月を先に読んでおくことにもなる
  const { holidays } = useCalendarDays(monthGridDays(month));
  const selectedWeek = weekStart(selected);
  const optionSx = { borderRadius: 1, py: 0.5 };
  return (
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: COLUMNS }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Typography
            key={label}
            variant="caption"
            align="center"
            sx={{ color: weekdayLabelColor(i) }}
          >
            {label}
          </Typography>
        ))}
      </Box>
      {monthGridWeeks(month).map((week) =>
        unit === 'week' ? (
          <ButtonBase
            key={week}
            aria-label={formatWeekRange(week)}
            onClick={() => onSelect(week)}
            sx={{
              ...optionSx,
              display: 'grid',
              gridTemplateColumns: COLUMNS,
              bgcolor: week === selectedWeek ? 'action.selected' : undefined,
            }}
          >
            {weekDays(week).map((date) => (
              <DayNumber
                key={date}
                date={date}
                size={32}
                holiday={holidays.has(date)}
                muted={!date.startsWith(month)}
              />
            ))}
          </ButtonBase>
        ) : (
          <Box key={week} sx={{ display: 'grid', gridTemplateColumns: COLUMNS }}>
            {weekDays(week).map((date) => (
              <ButtonBase
                key={date}
                aria-label={formatDateWithYear(date)}
                onClick={() => onSelect(date)}
                sx={{ ...optionSx, bgcolor: date === selected ? 'action.selected' : undefined }}
              >
                <DayNumber
                  date={date}
                  size={32}
                  holiday={holidays.has(date)}
                  muted={!date.startsWith(month)}
                />
              </ButtonBase>
            ))}
          </Box>
        ),
      )}
    </Box>
  );
}
