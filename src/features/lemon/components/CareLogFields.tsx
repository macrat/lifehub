import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import {
  CARE_TYPE_LABELS,
  CARE_TYPES,
  type CareType,
} from '../../../../shared/validation/lemon.ts';
import { toDateTimeLocalValue } from '../../../lib/date.ts';
import type { FormErrors } from '../../../lib/form.ts';

type Props = {
  careType: CareType;
  onChangeCareType: (careType: CareType) => void;
  /** 日時の既定値。追加では今、編集ではその記録の日時 */
  doneAt?: string;
  note?: string | null;
  errors: FormErrors;
};

/** 世話の記録の項目（種別・日時・メモ）。追加のフォームと詳細の編集で同じものを使う。 */
export function CareLogFields({ careType, onChangeCareType, doneAt, note, errors }: Props) {
  return (
    <>
      <TextField
        label="種別"
        select
        value={careType}
        onChange={(e) => onChangeCareType(e.target.value as CareType)}
        fullWidth
      >
        {CARE_TYPES.map((t) => (
          <MenuItem key={t} value={t}>
            {CARE_TYPE_LABELS[t]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        name="doneAt"
        label="日時"
        type="datetime-local"
        defaultValue={toDateTimeLocalValue(doneAt ?? new Date())}
        slotProps={{ inputLabel: { shrink: true } }}
        error={Boolean(errors.doneAt)}
        helperText={errors.doneAt}
        fullWidth
      />
      <TextField
        name="note"
        label={careType === 'note' ? 'メモ（必須）' : 'メモ'}
        defaultValue={note ?? ''}
        multiline
        minRows={2}
        error={Boolean(errors.note)}
        helperText={errors.note}
        fullWidth
      />
    </>
  );
}
