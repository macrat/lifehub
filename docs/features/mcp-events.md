# MCP Events（mcp-events）

## 目的

MCP クライアント（ChatGPT など）が、記録が足された・変えられたことを知らせてもらえるようにする。AI に「メモが書かれたら教えて」「立替が記録されたら残高を見て」のように頼んでおける。MCP Events（`io.modelcontextprotocol/events`）はまだドラフトの拡張で、ChatGPT の実装（[MCP Events](https://developers.openai.com/plugins/build/mcp-events)）が求める形に合わせる。

## 購読できるイベント

記録の種類ごとに 1 つ。好きなものだけを購読する。

| イベント | 届くとき |
|---|---|
| `memo.saved` | メモ（[memos.md](memos.md)）が書かれた・直された |
| `event.saved` | 予定・タスク（[events.md](events.md)）が足された・変えられた（タスクの完了・完了の取り消しも。繰り返しの 1 回だけを変えたときは、その回） |
| `expense.saved` | 立替（[expenses.md](expenses.md)）が記録された・直された |
| `lemon.saved` | レモンの世話（[lemon.md](lemon.md)）が記録された・直された（API キーからの記録も） |

- 追加と編集は同じイベントで、`data.action`（`added` / `updated`）で見分ける。WHY: 頼まれ方は「メモが書かれたら」のように種類で分かれ、追加か編集かで分けると購読を 2 つずつ持たせることになる。
- 消したときは届かない。
- 誰が書いた記録も届く。家族の記録はどちらもタイムラインで読めるので、届く範囲もそれに揃える。`data.by` が書いた人（API キーからの記録はキーの名前）。
- 購読の引数は無い。
- `data.entry` は書いた後のエントリーで、`read_timeline` や書くツールが返すものと同じ形（`server/lib/mcp/entries.ts`。ref をそのまま `update_*` に渡せる）。届いた後に AI が別の形を読み直さずに済むように。

## 配り方

- webhook だけ（`events/subscribe` で受け手の URL と署名の鍵を受け取り、POST する）。WHY NOT poll・push（`events/poll`・`events/stream`）: サーバーレスで接続を持ち続けられず、遡れる履歴も持たない。同じ理由で `cursor` は常に `null`（遡りを求められたら `truncated: true`）。
- 書いたことは書いた service が知らせる（`publishSaved`）。画面・MCP・API キーのどの書き込みも service を通るので漏れない。応答は配り終えるのを待たず、応答を返した後に配る（`server/lib/after-response.ts`）。購読が無ければ問い合わせ 1 回で終わる。
- 本文は Standard Webhooks の署名付き（`standardwebhooks`。ヘッダーは `webhook-id`・`webhook-timestamp`・`webhook-signature`・`X-MCP-Subscription-Id`）。`webhook-id` は `eventId` と同じで、送り直しても変えない。
  - 追加の `eventId` は記録の ref から決める（`evt_<ref>`）。オフラインで溜めた作成の再送で同じ追加がもう一度知らされても、受け手が重複として捨てられる。編集は毎回別の出来事なので新しく採番する。
- 届かなければ 2 秒後と 10 秒後に送り直す。410 は受け手が購読をやめたので購読を消す。413 とほかの 4xx は送り直しても変わらないので諦める（408 と 429 は送り直す）。WHY NOT QStash で送り直す: 送る先が受け手 1 つにつき 1 回で済み、応答の後の数秒で終わる。
- 受け手が内部のアドレス（ループバック・プライベート・リンクローカル・クラウドのメタデータなど）なら送らない（`request-filtering-agent`）。名前を引いた後のアドレスで確かめてそこへ繋ぐので、DNS rebinding でも内部へ届かない。HTTPS だけで、リダイレクトは追わない。

## 購読

- 初めての購読は、受け手が challenge を返せることを確かめてから保存する（`{"type":"verification","challenge":…}` を送り、同じ値が返ること）。他人の URL を通知先に書いて、LifeHub から無関係なサーバーへ POST させないため。確かめられなければ `-32015`（`data.reason` は `connection_refused` / `timeout` / `tls_error` / `http_4xx` / `http_5xx` / `challenge_failed`）。
- 購読の id は人・URL・イベント名から決める（`sub_` + SHA-256）。同じ購読をし直すと同じ行の期限と鍵を更新し、確かめ直さない（冪等）。
- 期限は望まれた `ttlMs` を 1 分〜30 日に収めたもの（省いたとき・`null` のときは 30 日）。クライアントは `refreshBefore` より前に購読し直す。WHY NOT 期限なし: 使われなくなった購読へ送り続けないよう、購読し直しで生きていることを示させる。期限を過ぎた購読は配らず、次の購読のときに消す。
- し直しで鍵が変わったら、24 時間は前の鍵でも署名する（`webhook-signature` に空白区切りで並べる）。入れ替えの前に送り始めた配信も受け手が確かめられるように。
- `events/unsubscribe` は無い購読をやめても成功する。

## データ

`mcp_event_subscriptions`（[data-model.md](../data-model.md)）。購読 1 件に 1 行で、購読した人・イベント名・URL・鍵（入れ替え中は前の鍵と、それを使う期限）・期限を持つ。人が消えれば購読も消える。

## API

無い。画面を持たず、購読は MCP からだけ受ける。

## MCP ツール

ツールは無い。MCP の `events/list`・`events/subscribe`・`events/unsubscribe` を `server/features/mcp-events/mcp.ts` が受ける。capability は `events` と `extensions["io.modelcontextprotocol/events"]` の両方で知らせる（ドラフトの書き方と、拡張としての名前）。エラーは MCP Events のコード（`-32011` 知らないイベント、`-32014` webhook 以外の配り方、`-32602` 引数・URL・鍵の誤り、`-32015` 受け手を確かめられない）で返す。
