# プッシュ通知（notifications）

## 目的

予定・タスクの開始／終了（期限）の前に、Web Push で端末へ通知する。

## 通知内容

- 開始の `remind_start_minutes` 前と、終了（期限）の `remind_end_minutes` 前。項目ごとに選択し、既定はどちらも通知なし。予定のフォームは開始前だけ、タスクのフォームは「開始日時に通知」「期限日時に通知」（= 0 分前）を出す。完了したタスクには送らない。
- 終日の予定・タスクは、開始日／終了日（期限日）の **各参加者の通知時刻**（`users.all_day_notify_minutes`、既定 7:00）に送る。終日の n は 0（当日）か 1440（前日）だけを許す（`shared/validation/events.ts` の `ALL_DAY_REMIND_OPTIONS` と CHECK 制約）。予定のフォームは終日なら「当日」「前日」だけを出し、時刻のある予定を終日に切り替えたときは 0 分前を当日、それ以外を前日に寄せる（`toAllDayRemind`）。
  - WHY: 終日には「n 分前」の瞬間が無い（0:00 の n 分前では夜中に届く）。何時に知りたいかは人によって違うので、項目ではなくユーザーの設定（`/settings` の「終日の通知」）で選ぶ。
  - 宛先はユーザーごとに時刻が違うので、終日の項目は参加者ごとに予約する（`ref.userId`）。時刻のある項目は `userId: null` で参加者全員に 1 つ。
  - 通知時刻を変えると、users service が当日〜翌日の分をその場で予約し直す。古い時刻の予約は配信時の再検証で配信予定時刻が合わずに捨てられる。
- 送信先: 参加者の全端末（終日の項目は `ref.userId` の全端末）。
- 通知をタップすると該当画面（`/calendar?date=YYYY-MM-DD`）を開く。

## 見た目（`src/sw.ts`）

- 通知の中の絵は `icon-192.png`（色付きのアプリアイコン）。
- ステータスバーに出る小さな印は `badge-96.png`。Android はこれを alpha だけの単色として塗るので、色付きの板を持つアプリアイコンを渡すと塗り潰れた四角になる。背景の板を持たない字だけの形（`public/icons/badge.svg`）を別に用意してある。
- `lang: 'ja'` を付けて、読み上げと折り返しを日本語として扱わせる。
- 通知が届くとホーム画面のアイコンにも点が付く（Badging API。`setAppBadge()` を引数なしで呼ぶ）。通知は「予定の直前に一度だけ」届くもので未読という状態を持たないので、数は出さない。点を消すのは通知をタップしたときと、アプリの画面を見たとき（`src/lib/app-badge.ts`）。

## 仕組み（「予約は使い捨て、配信時に再検証」方式）

予定の変更・削除のたびに予約をキャンセルする処理を書かなくて済むようにするため、予約は使い捨てにし、配信時に再検証する。

1. Vercel Cron（日次 00:00 JST = UTC `0 15 * * *`）が `GET /api/cron/notifications`（`server/lib/cron.ts`）を呼ぶ（`Authorization: Bearer <CRON_SECRET>` で保護。Vercel は `CRON_SECRET` があればこのヘッダを自動で付ける）。`listNotifications` で翌日分（JST の翌日 0:00〜翌々日 0:00）を列挙し、QStash に `notBefore`（配信時刻）付きで予約する。`deduplicationId` = 通知キーで重複を防ぐ。
   - キーは配信予定時刻を含む（`event:<id>:<occurrenceStart ISO | single>:<start|end>:<at>`、終日の項目は末尾に `:<userId>`）。日時や通知設定が変わると別のキーで予約し直され、古い予約は配信時の再検証で捨てられる。
2. 予定・タスクの作成／変更で当日〜翌日に新たな通知が発生する場合は、その場で同様に予約する（dedupe により重複しない）。service の `create` / `update` から `enqueueUpcoming()` を呼ぶ。
3. 配信時刻に QStash が `POST /api/qstash/notifications`（`server/lib/qstash-routes.ts`）を呼ぶ。`Upstash-Signature` を検証後、`sent_notifications` に key を挿入し（既にあれば重複として終了）、`resolveNotification(ref)` で対象を再読込する。削除・変更（配信予定時刻や通知時刻がずれた、宛先が参加者でなくなった）・完了済みなら送らない。
4. `web-push` で各購読へ送信。410/404 は購読を削除する。Service Worker（`src/sw.ts`）が通知を表示し、タップで該当画面を開く。
5. 日次 Cron は 30 日より古い `sent_notifications` を削除する。

`VERCEL_ENV !== 'production'` のとき、1 と 2 の QStash への publish を行わない（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。Preview には本番の通知用秘密情報を渡さず、3 の配信も拒否する。`QSTASH_TOKEN` 未設定（ローカル）でも publish を行わない。

## 構成

```ts
// server/features/events/notifications.ts
export const notificationRefSchema = z.object({ id, occurrenceStart, edge: 'start' | 'end', at, userId });
export function listNotifications(range): Promise<{ key; at; ref }[]>;   // 予約する通知の列挙
export function resolveNotification(ref): Promise<NotificationPayload | null>; // 配信直前の再検証
```

通知源は予定・タスク（events）だけなので registry は置かず、`server/lib/notifications/service.ts`（予約・配信の共通処理）が直接呼ぶ。QStash のメッセージ本文は `{ key, ref }` で、`key` は冪等性のための不透明な一意キー（中身は読まない）、`ref` は配信時に Zod（`notificationRefSchema`）で読み直す構造化された参照。QStash の呼び出しと署名検証は `server/lib/qstash.ts`、Web Push の送信は `server/features/push/service.ts`。QStash は US（us-east-1）リージョンを使う（日本から近い）。SDK の既定は EU なのでエンドポイントをコードに固定してあり、トークンと署名鍵も US リージョンのものを使う。

## 購読

- `/settings` で「この端末で通知を受け取る」を押すと Notifications API の許可 → PushManager 購読 → `POST /api/push/subscriptions` に保存（`src/features/push/queries.ts`、画面は `PushSection`）。解除は `DELETE /api/push/subscriptions`（endpoint 指定）。購読状態は `GET /api/push/subscriptions/status?endpoint=`。
- iOS はホーム画面に追加した PWA でのみ有効であることを UI で案内する。
- 購読の登録・解除・状態の確認と送信は `server/features/push/service.ts` に集める（購読の行を書き換えるのはここだけ）。購読の削除はログイン中の所有者に限り、状態の確認も持ち主が本人のときだけ「購読中」と答える。送信先は HTTPS の Google / Mozilla / Apple / Windows の Push サービスに限定し、保存時と送信時に検証する。
- VAPID 公開鍵は `GET /api/push/vapid-public-key` で配る。

## データ

`push_subscriptions`, `sent_notifications`（[data-model.md](../data-model.md)）。

## 環境変数

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET`。Vercel の環境変数（Sensitive）として Terraform が設定する。`QSTASH_*` は US リージョンの値を使う。

いずれも本番では必須で、1 つでも欠けていればサーバーは起動しない（`server/lib/env.ts` の `PRODUCTION_REQUIRED`）。欠けたままでも予約（`createPublisher()` が `null` を返す）と送信（`ensureConfigured()` が `false` を返す）は何もせずに正常終了してしまい、画面にもログにも異常が出ないため、起動時に落とす以外に気づく手段が無い。この判定は `VERCEL_ENV` を読むので、Vercel のシステム環境変数を実行時に公開しておく必要がある（`infra/vercel.tf`）。ローカルと Preview は通知用の秘密情報を持たないので対象外。
