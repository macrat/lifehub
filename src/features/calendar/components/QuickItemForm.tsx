import type { QuickProps } from '../use-event-composer.ts';
import { useQuickForm } from '../use-quick-form.ts';
import { QuickForm } from './QuickForm.tsx';

/**
 * グリッドの下書き（選んだ範囲・長押しでつまんだ予定やタスク）を入力するクイック入力。
 * 予定の追加はグリッドをなぞっても追加ボタンからでもここへ来る。つまんで直しているとき（`draft.item`）も同じ入力で、
 * 既定値がその内容になるだけ。上端の切り替えで予定とタスクを入れ替えられ、入力の中身（日時・通知）と枠の形が変わる。
 * 状態と操作は `useQuickForm` が持ち、入れ物（スマホのシート・PC の吹き出し）と項目は `QuickForm`。
 * 予定とタスクで同じコンポーネントなので、種類を切り替えても入れ物と入力済みの欄は作り直さない。
 */
export function QuickItemForm(props: QuickProps) {
  const quick = useQuickForm(props);
  return <QuickForm {...props} kind={props.draft.kind} quick={quick} />;
}
