import type { QuickProps, TaskGridDraft } from '../use-event-composer.ts';
import { useQuickEventForm } from '../use-quick-event-form.ts';
import { useQuickTaskForm } from '../use-quick-task-form.ts';
import { QuickForm } from './QuickForm.tsx';

/**
 * 選んだ範囲に予定を入れるための入力。予定の追加はグリッドをなぞっても追加ボタンからでもここへ来る。
 * 予定を長押しでつまんで直しているとき（`draft.item`）も同じ入力で、既定値がその予定の内容になるだけ。
 * 状態と操作は `useQuickEventForm` が持ち、入れ物（スマホのシート・PC の吹き出し）と項目は `QuickForm`。
 */
export function QuickEventForm(props: QuickProps) {
  const quick = useQuickEventForm(props);
  return <QuickForm {...props} kind="event" quick={quick} />;
}

/**
 * 長押しでつまんで動かしたタスクの入力。予定と同じ入れ物（`QuickForm`）で、スマホでは画面の下半分の
 * シート（下の段はタイトル・日時の見出し・参加者だけ）から始まり、上の段まで広げるとタスクの全項目
 * （終日・開始・期限・場所・メモ・繰り返し・通知）になる。
 * 下の段では後ろのグリッドを触れるので、シートを開いたまま枠をつまんで動かし直せる。
 */
export function QuickTaskForm(props: Omit<QuickProps, 'draft'> & { draft: TaskGridDraft }) {
  const quick = useQuickTaskForm(props);
  return <QuickForm {...props} kind="task" quick={quick} />;
}
