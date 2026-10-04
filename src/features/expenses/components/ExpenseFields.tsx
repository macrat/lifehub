import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { today } from '../../../../shared/date.ts';
import { SELECT_NONE, selectValue } from '../../../lib/form.ts';
import { formatExpression, normalizeExpression, pressKey } from '../calculator.ts';
import type { ExpenseFieldsState } from '../use-expense-form.ts';
import { Calculator } from './Calculator.tsx';

/** 最初に入れておく値（initial）は `useExpenseForm` に渡したもの。省いた項目は追加の既定値（日付は今日） */
type Props = ExpenseFieldsState;

/**
 * 立替の項目。上から日付・To/From・内容・金額と並べ、いちばん下の電卓で金額欄をそのまま計算する。
 * To は誰のために払ったか（既定は共有）、From は払った人（既定はログイン中のユーザー）。どちらにも共有（共有口座）を選べる。
 * 追加のフォームと詳細の編集で同じものを使う。
 */
export function ExpenseFields({
  initial,
  parties,
  toOptions,
  fromOptions,
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
          {toOptions.map(partyItem)}
        </TextField>
        <TextField
          label="From"
          select
          value={parties.fromUserId ?? SELECT_NONE}
          onChange={(e) => onChangeFrom(selectValue(e.target.value))}
          error={Boolean(errors.fromUserId)}
          helperText={errors.fromUserId}
          fullWidth
        >
          {fromOptions.map(partyItem)}
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
        value={formatExpression(amount)}
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

/** To・From の選択肢 1 つ。共有（null）は Select の値として SELECT_NONE にする */
function partyItem({ value, label }: { value: string | null; label: string }) {
  return (
    <MenuItem key={value ?? SELECT_NONE} value={value ?? SELECT_NONE}>
      {label}
    </MenuItem>
  );
}
