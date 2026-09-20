# プッシュ通知（notifications）

## 目的

予定の開始前、タスクの開始日時・期限日時に、Web Push で端末へ通知する。

## 通知内容

- 予定: 開始の `remind_before_minutes` 前。予定ごとに選択し、既定は通知なし。
- タスク: `starts_at` と `due_at` それぞれの時刻ちょうど（`notify_at_start` / `notify_at_due` で個別に ON/OFF）。
- 送信先: `owner_user_id` / `assignee_user_id` が指定されていればその人の全端末、null（共有）なら 2 人の全端末。
- 通知をタップすると該当画面（`/calendar?date=YYYY-MM-DD`）を開く。

## 仕組み（「予約は使い捨て、配信時に再検証」方式）

予定の変更・削除のたびに予約をキャンセルする処理を書かなくて済むようにするため、予約は使い捨てにし、配信時に再検証する。

1. Vercel Cron（日次 00:00 JST = UTC `0 15 * * *`）が `GET /api/notifications/enqueue` を呼ぶ（`Authorization: Bearer <CRON_SECRET>` で保護。Vercel は `CRON_SECRET` があればこのヘッダを自動で付ける）。全 `NotificationSource` から翌日分（JST の翌日 0:00〜翌々日 0:00）を列挙し、QStash に `notBefore`（配信時刻）付きで予約する。`deduplicationId` = 通知キーで重複を防ぐ。
   - キーは配信予定時刻を含む: `event:<id>:<occurrenceStart>:<at>`、`task:<id>:<occurrenceKey>:<start|due>:<at>`。開始時刻や通知設定が変わると別のキーで予約し直され、古い予約は配信時の再検証で捨てられる。
2. 予定・タスクの作成／変更で当日〜翌日に新たな通知が発生する場合は、その場で同様に予約する（dedupe により重複しない）。service の `create` / `update` から `enqueueUpcoming()` を呼ぶ。
3. 配信時刻に QStash が `POST /api/notifications/deliver` を呼ぶ。`Upstash-Signature` を検証後、`sent_notifications` に key を挿入し（既にあれば重複として終了）、`resolve(key)` で対象を再読込する。削除・変更（配信予定時刻がずれた）・完了済みなら送らない。
4. `web-push` で各購読へ送信。410/404 は購読を削除する。Service Worker（`src/sw.ts`）が通知を表示し、タップで該当画面を開く。
5. 日次 Cron は 30 日より古い `sent_notifications` を削除する。

`VERCEL_ENV !== 'production'` のとき、1 と 2 の QStash への publish を行わない（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。3 の署名検証は Preview でも行う。`QSTASH_TOKEN` 未設定（ローカル）でも publish を行わない。

## 拡張ポイント

```ts
// server/lib/notifications/types.ts
export type NotificationSource = {
  id: string;
  list: (range: { from: Date; to: Date }) => Promise<PlannedNotification[]>;
  resolve: (key: string) => Promise<NotificationPayload | null>;
};
```

`server/features/events/notifications.ts` と `server/features/tasks/notifications.ts` が実装し、`server/lib/notifications/registry.ts` に列挙する。キーの先頭（`event:` / `task:`）で `resolve` の振り分けを行う。予約・配信の共通処理は `server/lib/notifications/service.ts`、QStash の呼び出しと署名検証は `server/lib/qstash.ts`、Web Push の送信は `server/lib/push/send.ts`。

## 購読

- `/settings` で「この端末で通知を受け取る」を押すと Notifications API の許可 → PushManager 購読 → `POST /api/push/subscriptions` に保存（`src/lib/push.ts`）。解除は `DELETE /api/push/subscriptions`（endpoint 指定）。購読状態は `GET /api/push/subscriptions/status?endpoint=`。
- iOS はホーム画面に追加した PWA でのみ有効であることを UI で案内する。
- VAPID 公開鍵は `GET /api/push/vapid-public-key` で配る。

## データ

`push_subscriptions`, `sent_notifications`（[data-model.md](../data-model.md)）。

## 環境変数

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET`。Vercel の環境変数（Sensitive）として Terraform が設定する。
