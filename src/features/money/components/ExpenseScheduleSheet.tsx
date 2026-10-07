import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import type { ExpenseSchedule } from '../../../../shared/money.ts';
import { SCHEDULE_FREQUENCIES, type ScheduleFrequency } from '../../../../shared/money.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { FREQUENCY_LABELS } from '../schedule-labels.ts';
import { useExpenseScheduleSheet } from '../use-expense-schedule-sheet.ts';
import { ExpenseFields } from './ExpenseFields.tsx';

type Props = {
  /** 変えるスケジュール。null なら追加 */
  schedule: ExpenseSchedule | null;
  onClose: () => void;
};

/**
 * 立替スケジュールの追加と変更。項目は立替と同じで、日付は最初の日、その下に繰り返し（毎日・毎週・毎月・毎年）
 */
export function ExpenseScheduleSheet({ schedule, onClose }: Props) {
  const { fields, frequency, setFrequency, sheet } = useExpenseScheduleSheet(schedule, onClose);
  return (
    <RecordSheet title={schedule ? schedule.description : '立替スケジュールを追加'} {...sheet}>
      <ExpenseFields
        {...fields}
        dateLabel="最初の日"
        afterDate={
          <TextField
            label="繰り返し"
            select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
            fullWidth
          >
            {SCHEDULE_FREQUENCIES.map((frequency) => (
              <MenuItem key={frequency} value={frequency}>
                {FREQUENCY_LABELS[frequency]}
              </MenuItem>
            ))}
          </TextField>
        }
      />
    </RecordSheet>
  );
}
