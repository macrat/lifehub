import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { type FormEvent, useState } from 'react';
import {
  CARE_TYPE_LABELS,
  CARE_TYPES,
  type CareType,
  createCareLogSchema,
} from '../../../../shared/validation/lemon.ts';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../../lib/date.ts';
import { type FormErrors, parseValues } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import type { CreateCareLogBody } from '../queries.ts';

type Props = {
  open: boolean;
  initialCareType?: CareType;
  onSubmit: (input: CreateCareLogBody) => Promise<unknown>;
  onClose: () => void;
};

/** レモンの世話の記録。日時の既定は今。 */
export function CareLogForm({ open, initialCareType = 'water', onSubmit, onClose }: Props) {
  const [careType, setCareType] = useState<CareType>(initialCareType);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const doneAtRaw = fd.get('doneAt');
    const note = fd.get('note');
    const raw = {
      careType,
      doneAt:
        typeof doneAtRaw === 'string' && doneAtRaw !== ''
          ? fromDateTimeLocalValue(doneAtRaw)
          : undefined,
      note: typeof note === 'string' && note !== '' ? note : null,
    };
    const parsed = parseValues(createCareLogSchema, raw);
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit({ ...parsed.data, doneAt: parsed.data.doneAt.toISOString() });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title="レモンの記録"
      onSubmit={handleSubmit}
      actions={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <SubmitButton disabled={submitting} />
        </>
      }
    >
      <Stack spacing={2} sx={{ mt: 1 }}>
        {submitError && <Alert severity="error">{submitError}</Alert>}
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
      </Stack>
    </FormDialog>
  );
}
