import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { EventKind } from '../../../../shared/validation/events.ts';
import { ADD_KINDS } from '../../add/kinds.ts';

const KINDS: EventKind[] = ['event', 'task'];

/**
 * 予定・タスクの入力の上端に置く「予定｜タスク」の切り替え。予定とタスクは同じ入れ物・同じ項目で入力し、
 * 違うのは日時と通知の項目だけなので、書き始めてから種類を変えられるようにする。
 * 入力のときの上端の帯は見出しを出さず空いているので（`SheetHeader`）、そこに置けばシートの高さは増えない。
 * 押された種類を渡すだけで、何を引き継ぐかは呼び出し側が決める。
 */
export function KindToggle({
  kind,
  onChange,
}: {
  kind: EventKind;
  onChange: (kind: EventKind) => void;
}) {
  return (
    <ToggleButtonGroup
      value={kind}
      exclusive
      size="small"
      aria-label="種類"
      // 押している方をもう一度押すと値が null で来る（選択を外す操作）。種類は外せないので無視する
      onChange={(_, next: EventKind | null) => {
        if (next !== null && next !== kind) onChange(next);
      }}
    >
      {KINDS.map((k) => (
        <ToggleButton key={k} value={k} sx={{ px: 1.5, py: 0.5 }}>
          {ADD_KINDS[k].label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
