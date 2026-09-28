import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { isDateString } from '../../../../shared/date.ts';
import {
  buildRRule,
  parseRRule,
  RECURRENCE_FREQ_OPTIONS,
  type RecurrenceFreq,
} from '../recurrence-options.ts';

type Props = {
  /** 今の RRULE（null = 繰り返さない） */
  initial: string | null;
  error?: string;
};

/**
 * 繰り返しの入力（頻度と終了日）。予定とタスクで共通。
 * 結果の RRULE は hidden input `rrule` に入れ、フォームは他の項目と同じく FormData から読む。
 * API で設定された複雑なルールはここでは変えられないので、そのまま保持する。
 */
export function RecurrenceFields({ initial, error }: Props) {
  const parsed = parseRRule(initial);
  const [freq, setFreq] = useState<RecurrenceFreq>(parsed.freq);
  const [until, setUntil] = useState(parsed.until ?? '');
  if (!parsed.isSimple) {
    return (
      <>
        <input type="hidden" name="rrule" value={initial ?? ''} />
        <Alert severity="info">
          繰り返しルール: {initial}（API で設定された詳細ルールはここでは変更できません）
        </Alert>
      </>
    );
  }
  const rrule = buildRRule(freq, isDateString(until) ? until : undefined);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <input type="hidden" name="rrule" value={rrule ?? ''} />
      <TextField
        label="繰り返し"
        select
        value={freq}
        onChange={(e) => setFreq(e.target.value as RecurrenceFreq)}
        error={Boolean(error)}
        helperText={error}
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
          label="繰り返しの終了日"
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText="空欄なら無期限"
          fullWidth
        />
      )}
    </Stack>
  );
}
