import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import TextField from '@mui/material/TextField';
import {
  CARE_TYPE_LABELS,
  CARE_TYPES,
  type CareType,
} from '../../../../shared/validation/lemon.ts';
import { toDateTimeLocalValue } from '../../../lib/date.ts';
import type { FormErrors } from '../../../lib/form.ts';

type Props = {
  careTypes: CareType[];
  onToggleCareType: (careType: CareType, checked: boolean) => void;
  /** 日時の既定値。追加では今、編集ではその記録の日時 */
  doneAt?: string;
  note?: string | null;
  errors: FormErrors;
};

/** 世話の記録の項目（やったこと・日時・メモ）。追加のフォームと詳細の編集で同じものを使う。 */
export function CareLogFields({ careTypes, onToggleCareType, doneAt, note, errors }: Props) {
  return (
    <>
      {/* 参加者の選択（ParticipantsField）と同じ、MUI のグループの組み立て */}
      <FormControl component="fieldset" variant="standard">
        <FormLabel component="legend" sx={{ fontSize: '0.75rem' }}>
          やったこと
        </FormLabel>
        {/* 3 列に並べると CARE_TYPES の順のまま、世話（葉水・水やり・施肥）と木の様子（開花・落果・収穫）で段が分かれる */}
        <FormGroup sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {CARE_TYPES.map((t) => (
            <FormControlLabel
              key={t}
              control={
                <Checkbox
                  checked={careTypes.includes(t)}
                  onChange={(e) => onToggleCareType(t, e.target.checked)}
                />
              }
              label={CARE_TYPE_LABELS[t]}
            />
          ))}
        </FormGroup>
      </FormControl>
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
        // やったことを 1 つも選ばない記録はメモそのもの（本文が無いと何も残らない）
        label={careTypes.length === 0 ? 'メモ（必須）' : 'メモ'}
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
