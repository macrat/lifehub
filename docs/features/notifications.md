# プッシュ通知（notifications）

## 目的

予定・タスクの開始と予定の終了の前に、Web Push で端末へ通知する。

## 通知内容

- 開始の `remind_start_minutes` 前と、予定の終了の `remind_end_minutes` 前に送る（列の値と既定は [events.md](events.md#データ)）。完了したタスクには送らない。
- 終日の予定・タスクは、開始日／終了日の **各参加者の通知時刻**（`users.all_day_notify_minutes`、既定 7:00）に送る。分が 0 ならその日の、1440 なら前日の通知時刻（終日で選べる値は [events.md](events.md#データ)）。
  - WHY: 終日には「n 分前」の瞬間が無い（0:00 の n 分前では夜中に届く）。何時に知りたいかは人によって違うので、項目ではなくユーザーの設定（`/settings` の「終日の通知」）で選ぶ。
  - 宛先はユーザーごとに時刻が違うので、終日の項目は参加者ごとに予約する（`ref.userId`）。時刻のある項目は `userId: null` で参加者全員に 1 つ。
  - 通知時刻を変えると、users service が当日〜翌日の分を予約し直す（下記「仕組み」の 2）。通知時刻は `server/features/users/people.ts` の `listAllDayNotifyMinutes` で読み、列挙と再検証（`server/features/events/notifications.ts`）には引数で渡す（users service から読むと、予約し直す呼び出しと合わせて import が一巡する）。古い時刻の予約は配信時の再検証で配信予定時刻が合わずに捨てられる。
- 送信先: 参加者の全端末（終日の項目は `ref.userId` の全端末）。
- 通知をタップすると該当画面（`/calendar?date=YYYY-MM-DD`）を開く。

## 見た目（`src/sw.ts`）

- 通知の中の絵は `icon-192.png`（色付きのアプリアイコン）。
- ステータスバーに出る小さな印は `badge-96.png`。Android はこれを alpha だけの単色として塗るので、色付きの板を持つアプリアイコンを渡すと塗り潰れた四角になる。背景の板を持たない字だけの形（`public/icons/badge.svg`）を別に用意してある。
- `lang: 'ja'` を付けて、読み上げと折り返しを日本語として扱わせる。
- 通知が届くとホーム画面のアイコンにも点が付く（Badging API。`setAppBadge()` を引数なしで呼ぶ）。通知は「予定の直前に一度だけ」届くもので未読という状態を持たないので、数は出さない。点を消すのは通知をタップしたときと、アプリの画面を見たとき（`src/lib/app-badge.ts`）。

## 仕組み（「予約は使い捨て、配信時に再検証」方式）

予定の変更・削除のたびに予約をキャンセルする処理を書かなくて済むようにするため、予約は使い捨てにし、配信時に再検証する。

1. Vercel Cron（日次 00:00 JST = UTC `0 15 * * *`）が `GET /api/cron/notifications`（`server/cron.ts`）を呼ぶ（`Authorization: Bearer <CRON_SECRET>` で保護。Vercel は `CRON_SECRET` があればこのヘッダを自動で付ける）。`listNotifications` で翌日分（JST の翌日 0:00〜翌々日 0:00）を列挙し、QStash に `notBefore`（配信時刻）付きで予約する。`deduplicationId` = 通知キーで重複を防ぐ。
   - キーは配信予定時刻を含む（`event:<id>:<occurrenceStart ISO | single>:<start|end>:<at>`、終日の項目は末尾に `:<userId>`）。日時や通知設定が変わると別のキーで予約し直され、古い予約は配信時の再検証で捨てられる。
2. 通知を増やしうる書き込み（予定・タスクの作成・変更・完了の取り消し、終日の通知時刻の変更）の後は、今から翌日の終わりまでの分を同様に予約する（dedupe により重複しない）。各 service がその書き込みの後に `scheduleUpcoming()` を呼ぶ。完了していた間は日次 Cron が列挙しないので、完了を取り消したタスクの当日の通知はここでしか予約されない。通知を減らすだけの書き込み（削除・完了）は呼ばない（古い予約は配信時の再検証で捨てられる）。
   - 予約は応答を返した後に行う（`server/lib/after-response.ts`。Vercel の `waitUntil` で関数を生かしておく）。予約は予定の読み出し・繰り返しの展開・QStash への送信を伴い、書き込みの応答を待たせる理由が無いため。失敗しても書き込みは取り消さず、ログに残すだけにする。
   - 予約先の無い環境（ローカル・Preview）では、列挙もせずに終える。
3. 配信時刻に QStash が `POST /api/qstash/notifications`（`server/qstash.ts`）を呼ぶ。`Upstash-Signature` を検証後、`sent_notifications` に key を挿入し（既にあれば重複として終了）、`resolveNotification(ref)` で対象を再読込する。削除・変更（配信予定時刻や通知時刻がずれた、宛先が参加者でなくなった）・完了済みなら送らない。再読込か送信で失敗したら挿入した key を消して 500 を返し、QStash の再試行で送り直す（残すと再試行が重複と判定され、届かないまま終わる）。
4. `web-push` で各購読へ送信。410/404 は購読を削除する。Service Worker（`src/sw.ts`）が通知を表示し、タップで該当画面を開く。
   - 削除は応答の後に回し（`server/lib/after-response.ts` の `afterResponse`）、失敗しても送信の失敗にはせずログに残すだけにする。送信の失敗は 3 の再試行を招き、届いた端末にも送り直すため。消し損ねた購読は次の送信でまた 410/404 を受けて消える。
   - 送れたら、同じ宛先の MCP Events の購読へ `event.reminder` も配る（[mcp-events.md](mcp-events.md)）。
5. 日次 Cron は 30 日より古い `sent_notifications` を削除する。

`VERCEL_ENV !== 'production'` のとき、1 と 2 の QStash への publish を行わない（Preview から本番と同じ通知が二重に飛ぶのを防ぐ）。Preview には本番の通知用秘密情報を渡さず、3 の配信も拒否する。`QSTASH_TOKEN` 未設定（ローカル）でも publish を行わない。

## 構成

```ts
// server/features/events/notifications.ts
export const notificationRefSchema = z.object({ id, occurrenceStart, edge: 'start' | 'end', at, userId });
// notifyTimes はユーザーごとの終日の通知時刻（読み出しは notifications の側が行って渡す）
export function listNotifications(range, notifyTimes): Promise<{ key; at; ref }[]>;   // 予約する通知の列挙
export function resolveNotification(ref, notifyTimes): Promise<NotificationPayload | null>; // 配信直前の再検証
```

通知源は予定・タスク（events）だけなので registry は置かず、`server/features/notifications/service.ts`（予約・配信の共通処理）が直接呼ぶ。通知は送信済み台帳（`sent_notifications`）を持つ 1 つの機能なので、feature として置き、repository の import の制限（他の feature の repository を読まない）も他の機能と同じに掛かる。QStash のメッセージ本文は `{ key, ref }`（`publisher.ts` の `notificationMessageSchema`。予約する側と配信の入口が同じスキーマを使う）で、`key` は冪等性のための不透明な一意キー（中身は読まない）、`ref` は配信時に Zod（`notificationRefSchema`）で読み直す構造化された参照。QStash への予約は `server/features/notifications/publisher.ts`、QStash の配信の署名検証は `server/lib/qstash.ts`（QStash が呼ぶ入口 `server/qstash.ts` の全体に掛ける）、Web Push の送信は `server/features/push/service.ts`。QStash のリージョンは [operations.md](../operations.md#初回セットアップ人が一度だけ行う手作業)。

## 購読

- `/settings` で「この端末で通知を受け取る」を押すと Notifications API の許可 → PushManager 購読 → サーバーに保存（`src/features/push/queries.ts`、画面は `PushSection`、スイッチの状態と案内は `use-push-setting.ts`）。
- iOS はホーム画面に追加した PWA でのみ有効であることを UI で案内する。
- 購読の登録・解除・状態の確認と送信は `server/features/push/service.ts` に集める（購読の行を書き換えるのはここだけ）。購読の削除はログイン中の所有者に限り、状態の確認も持ち主が本人のときだけ「購読中」と答える。送信先は HTTPS の Google / Mozilla / Apple / Windows の Push サービスに限定し、保存時と送信時に検証する。

## 環境変数

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET`。設定のしかたと、本番で欠けたときの扱いは [operations.md](../operations.md#terraforminfra)。

## データ

`push_subscriptions`, `sent_notifications`（[data-model.md](../data-model.md)）。

## API

| 手続き | 種類 | 認証 | 内容 |
|---|---|---|---|
| `push.vapidPublicKey` | 読み出し | セッション | VAPID 公開鍵 |
| `push.status` | 読み出し | セッション | この端末が購読中か（入力は `endpoint`。持ち主が本人のときだけ「購読中」） |
| `push.subscribe` | 書き込み | セッション | この端末の購読を保存する |
| `push.unsubscribe` | 書き込み | セッション | 購読を解除する（入力は `endpoint`。所有者だけ） |

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| GET | `/api/cron/notifications` | Cron secret | 翌日分の予約（上記「仕組み」の 1） |
| POST | `/api/qstash/notifications` | QStash の署名 | 配信（上記「仕組み」の 3） |

## MCP ツール

無し。通知の要否は予定・タスクの項目（`remind_start_minutes` / `remind_end_minutes`）で、MCP の `add_event` / `update_event` の `remindBeforeStart` / `remindBeforeEnd`（予定の終了だけ）で設定できる（[mcp.md](mcp.md)）。
