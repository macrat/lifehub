import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { today } from '../../../../shared/date.ts';
import { type FormErrors, SELECT_NONE } from '../../../lib/form.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { normalizeExpression, pressKey } from '../calculator.ts';
import type { Parties } from '../parties.ts';
import type { Expense } from '../queries.ts';
import { Calculator } from './Calculator.tsx';

type Props = {
  /** 編集する立替。省略すると追加の既定値（今日） */
  initial?: Expense;
  parties: Parties;
  onChangeTo: (to: string | null) => void;
  onChangeFrom: (from: string) => void;
  /** 金額欄の中身（電卓の式そのもの） */
  amount: string;
  onChangeAmount: (amount: string) => void;
  errors: FormErrors;
};

/**
 * 立替の項目。上から日付・To/From・内容・金額と並べ、いちばん下の電卓で金額欄をそのまま計算する。
 * To は誰のために払ったか（既定は共有 = 折半）、From は払った人（既定はログイン中のユーザー）。
 * 本人から本人へは払えないので、To の選択肢からは From の人を外す（From で To の人を選ぶと入れ替わる）。
 * 追加のフォームと詳細の編集で同じものを使う。
 */
export function ExpenseFields({
  initial,
  parties,
  onChangeTo,
  onChangeFrom,
  amount,
  onChangeAmount,
  errors,
}: Props) {
  const { options } = useUserLabels();
  const people = options.filter((o) => o.value !== null);

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
          value={parties.to ?? SELECT_NONE}
          onChange={(e) => onChangeTo(e.target.value === SELECT_NONE ? null : e.target.value)}
          error={Boolean(errors.toUserId)}
          helperText={errors.toUserId}
          fullWidth
        >
          <MenuItem value={SELECT_NONE}>共有</MenuItem>
          {people
            .filter((o) => o.value !== parties.from)
            .map((o) => (
              <MenuItem key={o.value} value={o.value ?? ''}>
                {o.label}
              </MenuItem>
            ))}
        </TextField>
        <TextField
          label="From"
          select
          value={parties.from}
          onChange={(e) => onChangeFrom(e.target.value)}
          error={Boolean(errors.fromUserId)}
          helperText={errors.fromUserId}
          fullWidth
        >
          {people.map((o) => (
            <MenuItem key={o.value} value={o.value ?? ''}>
              {o.label}
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
