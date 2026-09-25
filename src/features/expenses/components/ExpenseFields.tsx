import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { today } from '../../../../shared/date.ts';
import { SELECT_NONE, selectValue } from '../../../lib/form.ts';
import { normalizeExpression, pressKey } from '../calculator.ts';
import type { Expense } from '../queries.ts';
import type { ExpenseFieldsState } from '../use-expense-form.ts';
import { Calculator } from './Calculator.tsx';

type Props = ExpenseFieldsState & {
  /** 編集する立替。省略すると追加の既定値（今日） */
  initial?: Expense;
};

/**
 * 立替の項目。上から日付・To/From・内容・金額と並べ、いちばん下の電卓で金額欄をそのまま計算する。
 * To は誰のために払ったか（既定は共有 = 折半）、From は払った人（既定はログイン中のユーザー）。
 * 追加のフォームと詳細の編集で同じものを使う。
 */
export function ExpenseFields({
  initial,
  parties,
  toUsers,
  fromUsers,
  onChangeTo,
  onChangeFrom,
  amount,
  onChangeAmount,
  errors,
}: Props) {
  return (
    <>
      <TextField
        name="spentOn"
        label="日付"
        type="date"
        defaultValue={initial?.spentOn ?? today()}
        slotProps={{ inputLabel: { shrink: true } }}
        error={Boolean(errors.spentOn)}
        helperText={errors.spentOn}
        fullWidth
      />
      {/* 簿記に倣い To（貸方）を左、From（借方）を右に横並び */}
      <Stack direction="row" spacing={1}>
        <TextField
          label="To"
          select
          value={parties.toUserId ?? SELECT_NONE}
          onChange={(e) => onChangeTo(selectValue(e.target.value))}
          error={Boolean(errors.toUserId)}
          helperText={errors.toUserId}
          fullWidth
        >
          <MenuItem value={SELECT_NONE}>共有</MenuItem>
          {toUsers.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="From"
          select
          value={parties.fromUserId}
          onChange={(e) => onChangeFrom(e.target.value)}
          error={Boolean(errors.fromUserId)}
          helperText={errors.fromUserId}
          fullWidth
        >
          {fromUsers.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <TextField
        name="description"
        label="内容"
        defaultValue={initial?.description ?? ''}
        error={Boolean(errors.description)}
        helperText={errors.description}
        fullWidth
      />
      <TextField
        label="金額（円）"
        value={amount}
        onChange={(e) => onChangeAmount(normalizeExpression(e.target.value))}
        // 画面の電卓で入力するので、タップしてもソフトキーボードは出さない（物理キーボードでは打てる）
        slotProps={{
          htmlInput: { inputMode: 'none', style: { textAlign: 'right', fontSize: '1.5rem' } },
        }}
        error={Boolean(errors.amount)}
        helperText={errors.amount}
        fullWidth
      />
      <Calculator onPress={(key) => onChangeAmount(pressKey(amount, key))} />
    </>
  );
}
