import TextField from '@mui/material/TextField';
import type { DateString } from '../../../shared/types.ts';
import { dateOrUndefined } from '../search.ts';

type Props = {
  since: DateString | undefined;
  until: DateString | undefined;
  onChange: (next: { since?: DateString | undefined; until?: DateString | undefined }) => void;
};

/**
 * 詳細な絞り込み（`FilterPanel`）の日付の範囲（開始日・終了日）。ホーム・立替・レモン・カレンダーのリスト表示で同じ欄を使う。
 * 省略した端は制限しないので、片方だけでも絞り込める。欄は `FilterPanel` の格子にそのまま並ぶ。
 */
export function DateRangeFilter({ since, until, onChange }: Props) {
  return (
    <>
      <TextField
        label="開始日"
        type="date"
        size="small"
        value={since ?? ''}
        onChange={(e) => onChange({ since: dateOrUndefined(e.target.value) })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="終了日"
        type="date"
        size="small"
        value={until ?? ''}
        onChange={(e) => onChange({ until: dateOrUndefined(e.target.value) })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </>
  );
}
