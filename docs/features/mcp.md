# MCP サーバー（mcp）

## 目的

任意の AI ツール（Claude 等）から LifeHub のデータを参照・登録する。UI と同じ Service 層を呼ぶ。

## エンドポイント

- `/api/mcp`、Streamable HTTP、ステートレス（サーバーレスのためセッションを持たない）。
- 認可は OAuth 2.1 のみ（MCP 仕様の標準。PKCE 必須）。better-auth の `@better-auth/mcp` プラグイン（`@better-auth/oauth-provider` を MCP 向けに設定したもの）で LifeHub 自身を認可サーバーにする。クライアント識別は Client ID Metadata Documents（`@better-auth/cimd`）を優先し、Dynamic Client Registration も有効にする。
- 認可サーバー（issuer）は `https://lifehub.crat.jp/api/auth`。探索メタデータは RFC 8414 / 9728 のとおりオリジン直下に置く: `/.well-known/oauth-authorization-server/api/auth`、`/.well-known/oauth-protected-resource/api/mcp`。オリジン直下は Vercel では静的配信の領域なので、`vercel.json` の rewrite（ローカルは vite の proxy）で `/api` の 1 関数へ振り向ける。rewrite でも関数が受け取る URL は元のパスのままなので、Hono は `/.well-known/*` をそのパスのまま受けて better-auth のハンドラへ渡す。
- ログインページ `/login`、同意ページ `/consent`。better-auth は署名付きクエリを付けてこれらへリダイレクトし、クライアントの `oauthProviderClient` がその署名付きクエリを `oauth_query` として API 呼び出しに添える。ログイン後は better-auth が返す URL（同意画面またはクライアントの `redirect_uri`）へ移動する。
- アクセストークンは JWT（`jwt` プラグイン。JWKS は `/api/auth/jwks`）。jwt プラグインの `/token`（セッション → JWT 交換）は `disabledPaths` で閉じる。`/api/mcp` では `requireMcpAuth` が署名・issuer・audience（`resource`）・期限を検証し、`sub` をユーザー ID としてツールに渡す。
- プラグインのテーブル（`jwks`, `oauth_clients`, `oauth_resources`, `oauth_client_resources`, `oauth_refresh_tokens`, `oauth_access_tokens`, `oauth_consents`, `oauth_client_assertions`）は `server/lib/db/oauth-schema.ts`。列は `npx auth generate` の出力に合わせ、名前だけ共通規約に寄せている。

## ツール一覧

ツールは REST API の写しではなく、LLM が説明を読んで迷わず呼べる形に作る（[architecture.md](../architecture.md) の「レイヤー構成」）。DB の表や API の口ごとに並べず、LifeHub を **タイムライン（日付の上に並ぶ記録）** として見せる: 予定（event）・タスク（task）・立替（expense）・レモンの木の世話（lemon）・メモ（memo）は、どれも同じ形の「エントリー」として `read_timeline` で読み、エントリーの `ref` で書き換える・消す。天気と祝日は日に付く。

| ツール | 内容 |
|---|---|
| `get_overview` | 最初に呼ぶ。今の日時と今日の日付、ユーザー（名前と自分）、今日と明日のタイムライン、立替の残高、レモンの世話の状況 |
| `read_timeline` | 期間（既定は今日から 7 日、最大 366 日）の記録を日ごとに。各日に祝日と天気の要約。`q`（文字の部分一致）と `types`（種類）で絞れる |
| `get_weather` | 期間（既定は今日から 8 日、最大 31 日）の天気を日ごとに。3 時間ごとの天気と気温・6 時間ごとの降水確率も |
| `add_event` | 予定を入れる |
| `add_task` | タスクを足す（`due` と `start` は任意） |
| `update_event` | 予定・タスクを ref で部分更新する |
| `set_task_done` | タスクを完了にする・完了を取り消す（`done`） |
| `add_expense` / `update_expense` | 立替（精算を含む）を記録する・直す。書いた後の残高も返す |
| `log_lemon_care` / `update_lemon_log` | レモンの世話を記録する・直す |
| `add_memo` / `update_memo` | メモを書く・直す（直せるのは書いた本人だけ） |
| `delete_entry` | どの種類のエントリーも ref で消す |

命名は `動詞_対象`（`read_timeline`・`add_task`）。読むツールは種類を問わず 1 本（`read_timeline`）にし、書くツールは種類ごとに分ける。読むときは「今週どうなってる？」のように種類をまたいで訊かれ、書くときは項目が種類ごとに違う（1 本にすると入力が種類ごとの分岐の `anyOf` になる）。消すのは ref だけで足りるので 1 本（`delete_entry`）。ツールの性質（`readOnlyHint` / `destructiveHint` / `idempotentHint`）を付け、クライアントが確認の要否を決められるようにする。サーバーの説明（`instructions`。`server/mcp.ts`）には全体の捉え方と約束事だけを書き、個々の使い方は各ツールの説明に書く。

### LLM に合わせた約束事

- **エントリーは ref で指す**（`server/lib/mcp/refs.ts`）。`<種類>:<ID>`、繰り返しの回は `<種類>:<ID>@<回の基準日時>`。種類・ID・回を別々の引数にすると LLM は組み合わせを取り違えるので、読んだ値を写すだけにする。種類が合わなければ（立替を直すツールにメモの ref を渡した等）、何の ref かを文で返す。
- **繰り返しの回を変える・消すときは `scope`（this / following / all）を必ず選ばせる**（`occurrenceTargetOf`）。既定をすべての回にすると「来週の歯医者を 10 時に」が毎週を動かし、この回だけにすると「毎週の歯医者を 10 時に」がその回だけを動かすので、どちらに倒しても取り返しの付かない変更になりうる。回を指さない ref（`@` なし）は scope を省けばすべて。
- **日時は JST で出し、入力のタイムゾーンは省ける**（`server/lib/mcp/time.ts`）。出力は `2030-01-07T09:00+09:00`（秒は出さない）、入力は `2030-01-07T09:00` を JST とみなす。UTC で出すと LLM は 9 時間ずらして読み違え、入力にタイムゾーンを必須にすると付け忘れや換算の誤りが起きる。
- **終日かどうかは日時の形で決める**。予定・タスクの開始・終了（期限）は、日付（`2030-01-07`）なら終日、日時なら時刻あり。`allDay` の旗を別に持たせると旗と日時が食い違う。終日の終了（期限）はその日を含む最終日で受け・返す（保存の排他的な終端は出さない）。日付と日時が混ざっていれば、揃えるよう文で返す。
- **タスクの期限は `due`、予定の終了は `end`**。API ではどちらも `endsAt` だが、LLM には意味の違う物なので名前を分ける。取り違えは読み替えずに文で返す。
- **人は名前で指し、名前で返す**（`server/lib/mcp/people.ts`）。利用者は 2 人で、会話の中の人は名前で出てくる。自分は `"me"`、同じ名前の人がいるときのために ID も受ける。当てはまらなければ選べる名前を文で返す。立替の To の共有は `"shared"`。ユーザーの一覧は要求の中で 1 度だけ読む（`McpContext.people`）。
- **「今」を指す日時は省ける**。世話の日時・立替の日付は省くと今・今日、予定・タスクの参加者は省くと自分。LLM は今の日時を正確には知らず、必須にすると推し量った日時が記録される。今日の日付が要る計算（「明日」「来週」）のために、`get_overview` が今日を返す。
- **更新は部分更新**（`server/lib/patch.ts` の `applyPatch`）。LLM は「タイトルだけ変えて」を頼まれたとき他の項目を書き写さないので、省いた項目は今のまま、`null` は消す。service（`patchEvent` / `patchExpense` / `patchLog`）が今の値に重ね、追加・編集と同じ組み合わせの規則（`eventRulesSchema` / `expenseRulesSchema` / `careLogRulesSchema`）を掛ける。予定の開始だけが変われば、長さを保って終了もずらす（`keepDuration`。「3 時からにして」で終了を渡されないと、開始が終了を追い越すか予定が伸び縮みする）。終日と時刻ありを切り替えるときは、今の値が日時を持つ端（開始・終了（期限））をすべて指定させる（`requireBothEnds`）。終日の日時は保存のときに 0:00 に丸めるので、省いた端を残すと「期限を日付にして」で開始の時刻が切り詰められるように、省いた項目が黙って変わる。予定の繰り返しの回（`scope: this`）では、その回の今の値に重ね、変えた回（回の ref とその回の値）を返す。
- **作成でも組み合わせの規則を掛ける**。MCP の入力は API のスキーマを通らず `mcp.ts` が組み立てるので、service の作成（`createEvent` / `addExpense` / `logCare`）が書き込む所で規則を掛ける（`server/lib/patch.ts` の `checkRules`）。部分更新の `applyPatch` と同じ所で確かめるので、どの経路の書き込みも規則を通る。
- **出力は短く**（`server/lib/mcp/entries.ts`）。JSON は字下げしない。値の無い項目（`null`）は省く。DB の列や API の形（UTC の日時、排他的な終端、ユーザー ID、`placementDate`）は出さない。書いたツールは書いた後のエントリー（ref 付き）を返し、立替は残高も返す（続けて「いくら払えば精算？」と訊かれることが多い）。
- **一度に返す量に上限を持つ**。`read_timeline` は 200 件を越える日から先を省き、どこから読み直せばよいか・どう絞ればよいかを文で添える。期間の上限（366 日・31 日）を越えれば、分けて読むよう文で返す。

### タイムラインの読み方

`read_timeline` と `get_overview` は、タイムラインの service の `listDays` を読む（ホームの画面のページ `getTimelinePage` ではない）。予定・タスクはカレンダーと同じく暦日に置き（`listItems`。複数日の予定は掛かる日すべてに出して `day` に何日目かを、未完了のタスクは開始が過ぎたか日時を持たなければ今日に）、立替・レモン・メモは各 feature の `timelineSource` を読む。WHY NOT ホームと同じく 1 回を 1 行にする: 行は置く日を 1 つしか持たないので、「10/2 の予定」を訊かれたとき 10/1 から続く旅行が 10/1 の側にしか出ない。日を指して読む相手には、その日に掛かる予定がすべてその日に出るほうが正しい。WHY NOT ホームと同じくページで読む: ページの境目は件数で決まり、LLM は日付で訊かれて日付で答えるので、期間で読むほうが扱いやすい。絞ったとき（`q` / `types`）は記録の無い日を省く。

### 組み立て

各 feature の `mcp.ts` が `ToolRegistrar`（`(server, ctx) => void`）を export し、`server/mcp.ts` で登録する。タイムラインを読む・消すツール（`get_overview` / `read_timeline` / `delete_entry`）は種類をまたぐので、記録を集める feature の `server/features/timeline/mcp.ts` に置く。LLM 向けの形（ref・日時・人・出力の形）は feature をまたぐので `server/lib/mcp/` に置き、feature の `mcp.ts` は LLM の入力を service の入力に直して呼ぶだけにする。入力スキーマは最上位が平らな Zod オブジェクトで、項目ごとの規則（長さ・選択肢）は `shared/validation` から取り、API の都合（クライアントが決める ID、省略させない範囲の指定など）は持ち込まない。MCP サーバーはリクエストごとに組み立てるステートレス構成（`@hono/mcp` の `StreamableHTTPTransport`、`enableJsonResponse`）。

## 接続方法

MCP クライアントに `https://lifehub.crat.jp/api/mcp` を登録する。初回はブラウザでログインと同意を求められる。Dynamic Client Registration（`/api/auth/oauth2/register`）と Client ID Metadata Documents の両方に対応している。
