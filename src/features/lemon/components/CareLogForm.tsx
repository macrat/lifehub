import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import {
  CARE_TYPE_LABELS,
  CARE_TYPES,
  type CareType,
  createCareLogSchema,
} from '../../../../shared/validation/lemon.ts';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../../lib/date.ts';
import { useFormSubmit } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import type { CreateCareLogBody } from '../queries.ts';

type Props = {
  initialCareType?: CareType;
  onSubmit: (input: CreateCareLogBody) => Promise<unknown>;
  onClose: () => void;
};

/** レモンの世話の記録。日時の既定は今。 */
export function CareLogForm({ initialCareType = 'water', onSubmit, onClose }: Props) {
  const [careType, setCareType] = useState<CareType>(initialCareType);
  const { errors, submitError, submitting, handleSubmit } = useFormSubmit({
    schema: createCareLogSchema,
    values: (fd) => {
      const doneAtRaw = fd.get('doneAt');
      const note = fd.get('note');
      return {
        careType,
        doneAt:
          typeof doneAtRaw === 'string' && doneAtRaw !== ''
            ? fromDateTimeLocalValue(doneAtRaw)
            : undefined,
        note: typeof note === 'string' && note !== '' ? note : null,
      };
    },
    onSubmit: (data) => onSubmit({ ...data, doneAt: data.doneAt.toISOString() }),
    onSuccess: onClose,
  });

  return (
    <FormDialog
      onClose={onClose}
      maxWidth="xs"
      title="レモンの記録"
      onSubmit={handleSubmit}
      submitting={submitting}
      error={submitError}
    >
      <TextField
        label="種別"
        select
        value={careType}
        onChange={(e) => setCareType(e.target.value as CareType)}
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
        defaultValue={toDateTimeLocalValue(new Date())}
        slotProps={{ inputLabel: { shrink: true } }}
        error={Boolean(errors.doneAt)}
        helperText={errors.doneAt}
        fullWidth
      />
      <TextField
        name="note"
        label={careType === 'note' ? 'メモ（必須）' : 'メモ'}
        multiline
        minRows={2}
        error={Boolean(errors.note)}
        helperText={errors.note}
        fullWidth
      />
    </FormDialog>
  );
}
