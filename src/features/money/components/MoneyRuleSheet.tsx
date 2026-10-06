import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { MONEY_RULE_KINDS, type MoneyRuleKind } from '../../../../shared/money.ts';
import type { MoneyRule } from '../../../../shared/validation/money.ts';
import { RecordSheet } from '../../../lib/ui/RecordSheet.tsx';
import { deleteAction } from '../../../lib/ui/use-record-detail.tsx';
import { useUserLabels } from '../../users/use-user-labels.ts';
import { KIND_LABELS } from '../rule-text.ts';
import { useMoneyRuleForm } from '../use-money-rule-form.ts';

/** 2 つの欄を横に並べる行（左の欄は中身の幅、右の欄が残りを取る） */
const FIELD_ROW_SX = { alignItems: 'center', gap: 1 } as const;

type Props = {
  /** 変えるルール。null なら追加 */
  rule: MoneyRule | null;
  /** 保存（並び全体の保存を待つ） */
  onSubmit: (rule: MoneyRule) => Promise<unknown>;
  /** 削除（変えるときだけ。三点リーダー） */
  onDelete: (id: string) => void;
  onClose: () => void;
};

/**
 * 取り込みルール 1 つの追加と変更。上から、パターン（正規表現）、「内容欄を置換」のスイッチと置換後の内容欄
 * （置換しないなら入力できない）、種別と対象者（支出なら選べない）、「一覧に表示しない」のスイッチ。
 * 状態と保存は `useMoneyRuleForm`
 */
export function MoneyRuleSheet({ rule, onSubmit, onDelete, onClose }: Props) {
  const { users } = useUserLabels();
  const { fields, sheet } = useMoneyRuleForm({ rule, onSubmit, onSaved: onClose });
  const { errors } = fields;
  const actions = rule
    ? [
        deleteAction(
          { confirm: 'この取り込みルールを削除しますか？', run: () => onDelete(rule.id) },
          onClose,
        ),
      ]
    : [];
  return (
    <RecordSheet
      {...sheet}
      onClose={onClose}
      actions={actions}
      title={rule ? rule.pattern : '取り込みルールを追加'}
    >
      <TextField
        name="pattern"
        label="パターン（正規表現）"
        defaultValue={rule?.pattern ?? ''}
        error={errors.pattern !== undefined}
        helperText={errors.pattern}
        slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off' } }}
        fullWidth
      />
      <Stack direction="row" sx={FIELD_ROW_SX}>
        <FormControlLabel
          label="内容欄を置換"
          control={
            <Switch
              checked={fields.replaceDescription}
              onChange={(e) => fields.setReplace(e.target.checked)}
            />
          }
          sx={{ flexShrink: 0, mr: 0 }}
        />
        <TextField
          name="replacement"
          label="置換後の内容欄"
          fullWidth
          disabled={!fields.replaceDescription}
          defaultValue={rule?.replacement ?? ''}
          error={errors.replacement !== undefined}
          helperText={errors.replacement}
        />
      </Stack>
      <Stack direction="row" sx={FIELD_ROW_SX}>
        <TextField
          label="種別"
          select
          value={fields.kind}
          onChange={(e) => fields.setKind(e.target.value as MoneyRuleKind)}
          sx={{ minWidth: 112 }}
        >
          {MONEY_RULE_KINDS.map((kind) => (
            <MenuItem key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="対象者"
          select
          fullWidth
          disabled={fields.kind === 'spending'}
          value={fields.userId ?? ''}
          onChange={(e) => fields.setUserId(e.target.value)}
          error={errors.userId !== undefined}
          helperText={errors.userId}
        >
          {users.map((user) => (
            <MenuItem key={user.id} value={user.id}>
              {user.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <FormControlLabel
        label="一覧に表示しない"
        control={
          <Switch checked={fields.hidden} onChange={(e) => fields.setHidden(e.target.checked)} />
        }
        sx={{ alignSelf: 'flex-start', mr: 0 }}
      />
    </RecordSheet>
  );
}
