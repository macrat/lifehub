import { useState } from 'react';
import { newId } from '../../../shared/id.ts';
import type { MoneyRuleKind } from '../../../shared/money.ts';
import { type MoneyRule, moneyRuleSchema } from '../../../shared/validation/money.ts';
import { formText, useFormSubmit } from '../../lib/form.ts';
import { deleteAction } from '../../lib/ui/use-record-detail.tsx';
import { useUserLabels } from '../users/use-user-labels.ts';

/**
 * 取り込みルール 1 つの入力（`MoneyRuleSheet`）の状態と保存。rule が null なら追加（ID はここで決める）。
 * 置換のスイッチ・種別・対象者は、ほかの欄を入力できるかを決めるので状態で持つ（置換しないなら置換後の内容欄、
 * 支出なら対象者は選べない）。入金・出金に変えたときは、対象者がまだ無ければ自分にしておく。
 * 正しくなければ（パターンが正規表現として読めない、置換するのに置換後が空、入金・出金なのに対象者が無い）欄に誤りを出す。
 * 変えるときは三点リーダーに削除を出す。`sheet` は `RecordSheet` にそのまま広げて渡す。
 */
export function useMoneyRuleForm({
  rule,
  onSubmit,
  onDelete,
  onClose,
}: {
  rule: MoneyRule | null;
  onSubmit: (rule: MoneyRule) => Promise<unknown>;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { meId } = useUserLabels();
  const [id] = useState(() => rule?.id ?? newId());
  const [replaceDescription, setReplace] = useState(rule?.replaceDescription ?? false);
  const [kind, setKindState] = useState<MoneyRuleKind>(rule?.kind ?? 'spending');
  const [userId, setUserId] = useState<string | null>(rule?.userId ?? null);
  const [hidden, setHidden] = useState(rule?.hidden ?? false);
  const form = useFormSubmit({
    schema: moneyRuleSchema,
    values: (fd) => ({
      id,
      pattern: formText(fd, 'pattern') ?? '',
      replaceDescription,
      // 置換しない間は欄が無効で送られないので、前の値を残す（置換に戻したときに打ち直さずに済む）。
      // 置換するなら欄の値そのもので、空にしたら空のまま検証に掛ける
      replacement: replaceDescription
        ? (formText(fd, 'replacement') ?? '')
        : (rule?.replacement ?? ''),
      kind,
      userId,
      hidden,
    }),
    onSubmit,
    onSaved: onClose,
  });
  const actions = rule
    ? [
        deleteAction(
          { confirm: 'この取り込みルールを削除しますか？', run: () => onDelete(rule.id) },
          onClose,
        ),
      ]
    : [];
  return {
    sheet: { ...form.sheet, onClose, actions },
    fields: {
      replaceDescription,
      setReplace,
      kind,
      setKind: (next: MoneyRuleKind) => {
        setKindState(next);
        if (next === 'spending') setUserId(null);
        else setUserId((current) => current ?? meId ?? null);
      },
      userId,
      setUserId,
      hidden,
      setHidden,
      errors: form.errors,
    },
  };
}
