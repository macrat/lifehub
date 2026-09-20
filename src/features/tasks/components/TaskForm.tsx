import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { type FormEvent, useState } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import type { RecurrenceScope } from '../../../../shared/validation/events.ts';
import { createTaskSchema } from '../../../../shared/validation/tasks.ts';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../../lib/date.ts';
import { type FormErrors, parseValues } from '../../../lib/form.ts';
import { FormDialog } from '../../../lib/ui/FormDialog.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import {
  buildRRule,
  parseRRule,
  RECURRENCE_FREQ_OPTIONS,
  type RecurrenceFreq,
} from '../../events/recurrence-options.ts';
import { useOwnerLabel } from '../../users/use-owner-label.ts';
import type { CreateTaskBody } from '../queries.ts';

/** Select の「共有」を表す値。空文字だとラベルが選択済みに見えないため */
const NONE = 'none';
const fromSelect = (value: string | null): string | null =>
  value === null || value === NONE ? null : value;

export type TaskFormValues = {
  title: string;
  note: string | null;
  assigneeUserId: string | null;
  startsAt: string | null;
  dueAt: string | null;
  rrule: string | null;
  notifyAtStart: boolean;
  notifyAtDue: boolean;
};

type Props = {
  open: boolean;
  title: string;
  initial: TaskFormValues;
  /** this のときは担当・繰り返し・通知は変更できない（この回だけの変更は日時・タイトル・メモのみ） */
  scope?: RecurrenceScope;
  onSubmit: (input: CreateTaskBody) => Promise<unknown>;
  onClose: () => void;
};

export function defaultTaskValues(date?: DateString): TaskFormValues {
  return {
    title: '',
    note: null,
    assigneeUserId: null,
    startsAt: date ? new Date(`${date}T09:00:00+09:00`).toISOString() : null,
    dueAt: null,
    rrule: null,
    notifyAtStart: false,
    notifyAtDue: false,
  };
}

export function TaskForm({ open, title, initial, scope = 'all', onSubmit, onClose }: Props) {
  const { options: ownerOptions } = useOwnerLabel();
  const [freq, setFreq] = useState<RecurrenceFreq>(parseRRule(initial.rrule).freq);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const parsedRRule = parseRRule(initial.rrule);
  const thisOnly = scope === 'this';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const text = (key: string) => {
      const v = fd.get(key);
      return typeof v === 'string' && v !== '' ? v : null;
    };
    const startsRaw = text('startsAt');
    const dueRaw = text('dueAt');
    const raw = {
      title: text('title') ?? '',
      note: text('note'),
      assigneeUserId: thisOnly ? initial.assigneeUserId : fromSelect(text('assigneeUserId')),
      startsAt: startsRaw ? fromDateTimeLocalValue(startsRaw) : null,
      dueAt: dueRaw ? fromDateTimeLocalValue(dueRaw) : null,
      rrule: thisOnly
        ? initial.rrule
        : parsedRRule.isSimple
          ? buildRRule(freq, (text('until') as DateString | null) ?? undefined)
          : initial.rrule,
      notifyAtStart: thisOnly ? initial.notifyAtStart : fd.get('notifyAtStart') === 'on',
      notifyAtDue: thisOnly ? initial.notifyAtDue : fd.get('notifyAtDue') === 'on',
    };
    const parsed = parseValues(createTaskSchema, raw);
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        ...parsed.data,
        startsAt: parsed.data.startsAt?.toISOString() ?? null,
        dueAt: parsed.data.dueAt?.toISOString() ?? null,
      });
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
      maxWidth="sm"
      title={title}
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
          name="title"
          label="タイトル"
          defaultValue={initial.title}
          error={Boolean(errors.title)}
          helperText={errors.title}
          autoFocus
          fullWidth
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            name="startsAt"
            label="開始日時"
            type="datetime-local"
            defaultValue={initial.startsAt ? toDateTimeLocalValue(initial.startsAt) : ''}
            error={Boolean(errors.startsAt)}
            helperText={errors.startsAt ?? '空欄なら今日から表示'}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <TextField
            name="dueAt"
            label="期限日時"
            type="datetime-local"
            defaultValue={initial.dueAt ? toDateTimeLocalValue(initial.dueAt) : ''}
            error={Boolean(errors.dueAt)}
            helperText={errors.dueAt}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
        </Stack>
        {!thisOnly && (
          <TextField
            name="assigneeUserId"
            label="担当"
            select
            defaultValue={initial.assigneeUserId ?? NONE}
            fullWidth
          >
            {ownerOptions.map((o) => (
              <MenuItem key={o.value ?? NONE} value={o.value ?? NONE}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          name="note"
          label="メモ"
          defaultValue={initial.note ?? ''}
          multiline
          minRows={2}
          fullWidth
        />
        {!thisOnly && parsedRRule.isSimple && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="繰り返し"
              select
              value={freq}
              onChange={(e) => setFreq(e.target.value as RecurrenceFreq)}
              error={Boolean(errors.rrule)}
              helperText={errors.rrule}
              fullWidth
            >
              {RECURRENCE_FREQ_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            {freq !== 'none' && (
              <TextField
                name="until"
                label="繰り返しの終了日"
                type="date"
                defaultValue={parsedRRule.until ?? ''}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="空欄なら無期限"
                fullWidth
              />
            )}
          </Stack>
        )}
        {!thisOnly && !parsedRRule.isSimple && (
          <Alert severity="info">
            繰り返しルール: {initial.rrule}（API で設定された詳細ルールはここでは変更できません）
          </Alert>
        )}
        {!thisOnly && (
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={<Checkbox name="notifyAtStart" defaultChecked={initial.notifyAtStart} />}
              label="開始日時に通知"
            />
            <FormControlLabel
              control={<Checkbox name="notifyAtDue" defaultChecked={initial.notifyAtDue} />}
              label="期限日時に通知"
            />
          </Stack>
        )}
      </Stack>
    </FormDialog>
  );
}
