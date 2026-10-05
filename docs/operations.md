# 運用

インフラ・デプロイ・バックアップ・監視の仕組みと手順。

原則: インフラの設定はすべて `infra/` の Terraform に書き、ダッシュボードで直接変更しない。デプロイは main ブランチへのプッシュで完結する。手動作業は初回セットアップ（下記）と外部 DNS の登録だけに限定する。

## 環境

| 環境 | ブランチ | DB | 用途 |
|---|---|---|---|
| `production` | main | Neon `main` ブランチ | 本番 https://lifehub.crat.jp |
| `preview` | PR | PR ごとに作る Neon ブランチ（`preview/pr-<番号>`） | `preview` ラベルを付けた PR の Vercel Preview URL |
| `local` | — | Neon `dev` ブランチ または Docker の Postgres | `pnpm dev` |

環境変数の一覧は [.env.example](../.env.example)。

## 初回セットアップ（人が一度だけ行う手作業）

1. アカウント作成: Vercel（Hobby）、Neon、Upstash、HCP Terraform、Sentry（Developer）、GitHub リポジトリ。いずれもカード登録不要。Sentry の組織の slug が `blanktar` でなければ `infra/variables.tf` の `sentry_organization` を書き換える。
2. ID の確認: Neon の組織 ID（コンソールの Organization settings。`org-...`）と Vercel のチーム slug または ID（Team Settings → General。Hobby でもアカウントはチームとして扱われる）。
3. トークン発行: Vercel API トークン（スコープにそのチームを含める）、Neon API キー、HCP Terraform の API トークン（organization `macrat` にワークスペース `lifehub` を作成し、Execution Mode を **Local** にする。plan/apply は GitHub Actions 側で走らせるため）。トークンはワークスペースの state をロックできる **User token か Team token** を使う（Organization token は state 操作に使えず、`Error acquiring the state lock: resource not found` になる）。Sentry の **User Auth Token**（User Settings → Personal Tokens。権限は Organization: Read、Team: Admin、Project: Admin、Release: Admin、Alerts: Read & Write。Terraform がチーム・プロジェクト・DSN・稼働監視を作り、デプロイがソースマップを送る。Organization Token はソースマップの送信にしか使えない）。
4. Upstash コンソールで QStash を有効化し、**US（us-east-1）リージョン**のトークンと Current/Next Signing Key を控える（リージョンごとにアカウント・トークン・署名鍵が独立していて、コードは US のエンドポイントに固定してある。`server/features/notifications/publisher.ts`。US を選ぶのは日本から近いため。SDK の既定は EU）。
5. `pnpm vapid:generate` で VAPID 鍵ペアを生成する。
6. 上記を GitHub Secrets に登録する:
   `VERCEL_TOKEN`, `NEON_API_KEY`, `TF_API_TOKEN`, `SENTRY_AUTH_TOKEN`, `TF_VAR_neon_org_id`, `TF_VAR_vercel_team`, `TF_VAR_qstash_token`, `TF_VAR_qstash_current_signing_key`, `TF_VAR_qstash_next_signing_key`, `TF_VAR_vapid_public_key`, `TF_VAR_vapid_private_key`
7. main へ最初のプッシュ → `deploy.yml` が Terraform apply を実行し、Vercel プロジェクトと Neon プロジェクトが作られる。
8. `terraform output dns_cname_target` の値を、外部 DNS の `lifehub.crat.jp` CNAME に登録する。
9. `pnpm user:create --email ... --name ... --password ...` を本番の `DATABASE_URL` に対して実行し、最初のユーザーを作る（`DATABASE_URL` は `terraform output -raw database_url`）。
10. ブラウザでログインし、`/admin/users` から 2 人目を登録する。

## Terraform（`infra/`）

| 対象 | リソース | 備考 |
|---|---|---|
| Vercel プロジェクト | `vercel_project` | フレームワーク `vite`、`git_repository` は設定しない（自動デプロイを無効化し、デプロイは GitHub Actions が行う）。`automatically_expose_system_environment_variables` を有効にし、`VERCEL`・`VERCEL_ENV`・`VERCEL_URL`・`VERCEL_BRANCH_URL` を関数に渡す。関数の地域は `resource_config.function_default_regions` で Neon と同じ `sin1`（シンガポール）にする（HTTP ドライバは問い合わせごとに DB と往復するので、利用者より DB の隣に置くほうが速い。Neon に日本の地域は無い） |
| ドメイン | `vercel_project_domain`（`lifehub.crat.jp`） | 外部 DNS への CNAME 登録は手動。登録先の値は `terraform output dns_cname_target` |
| 環境変数 | `vercel_project_environment_variable` | `DATABASE_URL`（Neon の出力）、`BETTER_AUTH_SECRET`・`CRON_SECRET`（`random_password`）、`QSTASH_*`・`VAPID_*`（変数から）。秘密情報は `sensitive` で置く。本番の秘密情報は production だけに置き、Preview には専用の `BETTER_AUTH_SECRET` と、デプロイ時に渡す PR ブランチの `DATABASE_URL` だけを渡す。`APP_URL` は production のみで `sensitive` ではない。production で欠けているものがあればサーバーは起動しない（`server/lib/env.ts` の `PRODUCTION_REQUIRED`）。通知の秘密情報（`QSTASH_*`・`VAPID_*`・`CRON_SECRET`）が欠けたままだと、予約（`createPublisher()` が `null`）と送信（`ensureConfigured()` が `false`）は何もせずに正常終了し、画面にもログにも異常が出ないので、起動時に落とす以外に気づく手段が無いため。判定は `VERCEL_ENV` を読むので、システム環境変数の公開（上の行）が要る。ローカルと Preview は通知用の秘密情報を持たないので対象外 |
| Neon | `neon_project`, `neon_branch`（`dev`）, `neon_endpoint`, `neon_database`, `neon_role` | `dev` ブランチはローカル開発用。PR ごとの Preview ブランチは GitHub Actions が作成・削除する |
| Sentry | `sentry_team`, `sentry_project`, `sentry_key`（DSN。日ごとの上限付き）, `sentry_uptime_monitor`（`/api/health`） | 下記「監視（Sentry）」。DSN は `SENTRY_DSN` として production にだけ渡す（`sensitive` ではない） |
| 内部シークレット | `random_password` | Terraform が生成し state に保持する |
| Preview 保護 | `vercel_project.vercel_authentication`（`standard_protection_new`） | Preview URL を Vercel 認証で保護する |
| 出力 | `vercel_org_id`, `vercel_project_id`, `dns_cname_target`, `database_url`(sensitive), `neon_project_id`, `sentry_organization`, `sentry_project` | GitHub Actions と初回セットアップが参照する |

- Terraform の入力（変数）として外部から渡すもの: Vercel API トークン、Neon API キーと組織 ID、Vercel のチーム、Sentry の User Auth Token、QStash トークンと署名鍵、VAPID 鍵ペア。GitHub Secrets → `TF_VAR_*` として渡す。
- GitHub Secrets はワークフローやジョブの `env` に置かず、それを使うステップの `env` にだけ渡す。テストやアプリのビルドなど依存パッケージのコードが動くステップにクレデンシャルを渡さないため。`typecheck / lint / test` ジョブは Secrets を一切受け取らず、`vercel build` にはトークンを渡さない。Terraform の出力（DB 接続文字列など）も `GITHUB_ENV` ではなくステップ出力にして、使うステップにだけ渡す。
- Terraform 対象外: Vercel Cron の定義（`vercel.json`）、外部 DNS の CNAME、DB マイグレーション、初期ユーザー作成。
- state は HCP Terraform（Free）のワークスペース `lifehub` にリモート保存し、GitHub Actions からは `TF_API_TOKEN` で接続する。
- プロバイダの更新はバージョン制約を編集する PR で行い、CI では `terraform init -upgrade` を使わない（Neon 公式が警告するリソース再作成事故を防ぐ）。PR の `terraform plan` に replace が含まれる場合はマージしない。

## デプロイフロー（GitHub Actions）

### PR（`ci.yml`）

1. `typecheck` → `lint` → `test` → `e2e`。並行して `gitleaks`（`gitleaks/gitleaks-action`）が PR のコミットに秘密情報が入っていないかを調べる
2. `terraform plan`（結果を PR コメントに投稿。差分が意図通りか、replace が無いかを人と LLM が確認する）。以下 3〜6 は PR に `preview` ラベルが付いていて、かつ main への最初の `terraform apply` が済んでいるとき（state に Vercel プロジェクトがあるとき）だけ実行する。きっかけは `preview` ラベルを付けたとき・ラベルの付いた PR に push したとき・ラベルの付いた PR を開き直したときで、関係ないラベルの付け外しでは作り直さない（Vercel の 1 日あたりのデプロイ数には上限があり、push のたびにすべての PR を作り直すとそれに当たるので、Preview が要る PR だけをラベルで選ぶ）
3. Neon ブランチ `preview/pr-<番号>` を `main` から作成（既にあれば再利用。`neondatabase/create-branch-action`）
4. そのブランチに `drizzle-kit migrate` を適用（本番相当のデータに対してマイグレーションを検証する）
5. `vercel pull --environment=preview` → `vercel build` → `vercel deploy --prebuilt` に `--env DATABASE_URL=<PR ブランチの接続文字列>` を付けて Preview デプロイ
6. Preview URL と Neon ブランチ名を PR コメントに投稿（更新時は同じコメントを書き換える）

### PR クローズ／マージ（`preview-cleanup.yml`）

Neon ブランチ `preview/pr-<番号>` を削除。Free プランのブランチ数上限（10）を超えないよう必ず行う。Preview を作っていない PR（`preview` ラベル無し、初回 apply 前）には消すものが無いので、Neon にブランチがあるかどうかを確かめてから削除し、無ければ何もしない。ラベルの有無では判断しない（デプロイ後にラベルを外した PR のブランチが残ってしまうため）。

### main へのプッシュ（`deploy.yml`）

1. `terraform apply -auto-approve`
2. `drizzle-kit migrate`（`DATABASE_URL` は `terraform output`）
3. `vercel pull --environment=production` → `vercel build --prod`
4. ソースマップを Sentry へ送る（`sentry-cli sourcemaps inject` / `upload`。失敗してもデプロイは続ける）
5. ソースマップを消す（公開しない）
6. `vercel deploy --prebuilt --prod`
7. Sentry のリリースに前のリリースからのコミットを紐付ける（`sentry-cli releases new` → `set-commits --auto` → `finalize`。失敗してもデプロイは続ける）。Sentry の GitHub 連携に登録済みのリポジトリのコミットとして紐付くので、コミットメッセージの `Fixes <Issue>` でそのリリースが出たときに Issue が解決済みになる

### Preview 環境の挙動

- Preview の環境変数は Terraform（target = `preview`）で管理し、`DATABASE_URL` だけをデプロイ時に PR ブランチの値で上書きする。
- 通知は予約も配信もしない（[features/notifications.md](features/notifications.md#仕組み予約は使い捨て配信時に再検証方式)）。
- better-auth の `baseURL` は、`APP_URL` があればそれに固定し、無ければ（= Preview）`VERCEL_URL`・`VERCEL_BRANCH_URL` のホストに限ってリクエストのホストから決める。Preview は URL がデプロイごとに変わるため、固定値では origin チェックに落ちてログインできない。この 2 つは Vercel のシステム環境変数なので、プロジェクト設定の公開（`automatically_expose_system_environment_variables`）が前提になる。

## バックアップ

バックアップは 2 段。Neon の PITR（直近 6 時間）は直前の誤操作を戻すため、日次の `backup.yml` はそれより前の状態と、Neon そのものが使えなくなったときのため。

`.github/workflows/backup.yml` が毎日 JST 4:00 に、本番 DB（`terraform output` の `DATABASE_URL`）に対して `pnpm db:dump`（`pg_dump`）と `pnpm calendar:export`（全員の全予定の ics）を実行し、`.github/backup-key.asc` の公開鍵で GnuPG により暗号化して、Artifact `backup-<JST の日付>` に 30 日保持で置く。ランナーの Postgres クライアントは本番（Neon）より古いので、PGDG から同じメジャーバージョンを入れて使う。public リポジトリの Artifact は誰でも取り出せるので暗号化する。公開鍵暗号にするのは、ランナーに復号できる秘密を置かずに済むため（共通鍵だと GitHub Secrets の鍵が漏れればすべてのバックアップが読める）。

手動でも実行できる（Actions の画面から `Run workflow`）。Artifact の中身:

- `lifehub.sql.gpg`: DB まるごとのダンプ（`pnpm db:dump`）。スキーマ・データ・マイグレーションの記録を含む。
- `lifehub.ics.gpg`: 全員の全予定（`pnpm calendar:export`）。LifeHub が使えなくなったときに他のカレンダーアプリへ取り込む用。タスクは含まない。

どちらも `.github/backup-key.asc` の公開鍵で暗号化してある。対になる秘密鍵を持つ GnuPG で復号する。

```sh
gpg --decrypt-files lifehub.sql.gpg lifehub.ics.gpg
```

鍵を替えたり有効期限を延ばしたりしたら、`.github/backup-key.asc` を書き出し直す（`gpg --armor --export <フィンガープリント>`）。暗号化用の副鍵が期限切れになるとバックアップが失敗する。

ダンプを戻すには、Postgres 17 以上のクライアント（`pg_dump` / `psql`。本番の Neon と同じ版以上が要る）を入れて次を実行する。ダンプに含まれるテーブルは中身ごと置き換わり、途中で失敗したら何も変わらない。

```sh
# 本番データのクローンを手元に作る（.env.local の DATABASE_URL に戻す）
pnpm db:restore lifehub.sql

# 本番から直接ダンプを取る（接続文字列は terraform output -raw database_url）
DATABASE_URL='postgresql://...' pnpm db:dump lifehub.sql
```

戻した DB では本番のパスワードでログインできる。セッションは `BETTER_AUTH_SECRET` が違うので引き継がれない。

## 監視（Sentry）

- 送るのは本番だけ。DSN（`SENTRY_DSN`）は production にしか無く、無ければ SDK は何も送らない（ローカル・テスト・Preview）。ブラウザへはビルド時に `vite.config.ts` の define で埋め込む（`vercel pull` で落とした値を `vercel build` が渡す）。サーバーとブラウザで同じ変数を読む。
- 送るのはエラー・トレース・ログ。セッションリプレイは無料枠が月 50 件しかなく、プロファイリングは無料枠に無いので使わない。
- サーバー（`server/lib/sentry.ts`。`api/index.ts` が起動し、Hono アプリを包む）:
  - エラー: `console.error` に出したものをすべて送る（`captureConsoleIntegration`）。想定外のエラーは共通のエラーハンドラ（Hono の `onError` と、画面の API の tRPC の `onError`）・応答の後の処理・通知の予約と送信がすでに `console.error` に出しているので、報告の呼び出しを個々に足さない。業務エラー（4xx）は出さないので送られない。`@sentry/hono` のミドルウェアと Sentry の tRPC のミドルウェア（`trpcMiddleware`）からは送らない（同じエラーが 2 件になり、業務エラーまで送られるため）。
  - トレース: 要求ごとにルート名（`GET /api/trpc/*`）のスパンと、その下のミドルウェア・画面の API の手続き・Neon への問い合わせ・外部への要求のスパン。`@sentry/hono` の案内する `--import` での起動は Vercel Function のエントリに置けないが、それが要るのは依存パッケージを読み込み時に書き換える計測だけで、要求と fetch のスパンは Node 標準の diagnostics_channel で取れる（DB は Neon の HTTP ドライバなので fetch）。`server/app.ts` のアプリはローカルとテストも使うので、Sentry は本番のエントリで包む外側にだけ入れる。
    - Neon への問い合わせは、SQL 文を名前にした DB のスパン（その下に HTTP のスパン）にする。Sentry の Queries で文ごとの回数と時間を見られる。Sentry にも Drizzle にも使える計測が無いので、Neon の HTTP ドライバの fetch（`neonConfig.fetchFunction`）を包み、送る本文から文を取り出す。文は Drizzle が値を `$1` などの置き場所にしたもので、値は送らない。
    - ミドルウェアのスパンの名前は関数名なので、ミドルウェアは名前の付いた変数に入れてから渡す（Biome のプラグイン `lint/named-middleware.grit` が強制する）。`validate` は検証する入力を名前にする（`validate(json)`）。
    - 画面の API は 1 本の要求にいくつもの手続きが載る（[architecture.md](architecture.md#通信の往復)）ので、要求のスパンの名前（`GET /api/trpc/*`）からはどの手続きかが分からない。手続きごとに `trpc/timeline.get` のような名前の `rpc` のスパンを要求のスパンの下に作る（`server/lib/trpc.ts` の `traced`）。
    - 要求のスパンには、インスタンスが起きて最初の要求かどうか（`faas.coldstart`）を付け、起動の分だけ遅い要求を普段の遅さと分けて見られるようにする。最初の要求には、プロセスが起きてからモジュールを読み終えるまでのスパン（`function.init`）も子として足す（理由と、最初の要求の見分け方は `server/lib/sentry.ts` の `coldStartMarker`）。
  - ログ: `console` に出したものをすべて送る（`consoleLoggingIntegration`）。
  - Vercel Function は応答の後に止まりうるので、`waitUntil` で送り終わるまで生かす（SDK が自分で待つのは Edge ランタイムだけ）。エラーはすぐ送るので送る直前に、スパンとログは SDK が 5 秒溜めてから送るので、要求のスパンが閉じたら `flush` する。`waitUntil` は要求の文脈の中でしか効かないので、閉じるのを待つ処理はミドルウェアの中で先に登録する。
- ブラウザ（`src/lib/sentry.ts`。`src/main.tsx` が起動）:
  - エラー: 未処理の例外と、ルートのエラー画面が受け止めた描画中のエラー（`createRoot` の `onCaughtError`）。API のエラーは送らない（サーバーのエラーはサーバーが送り、通信の失敗はオフラインで使う PWA では不具合ではない）。View Transition が飛ばされたときの失敗（途中で次の遷移が始まったときの AbortError と、途中で画面の大きさが変わったときの InvalidStateError）も送らない（アニメーションが省かれるだけで画面は更新される。ルーターが `ready` の失敗を受け取らないので未処理の例外として上がる。上流で直るまでの一時的な対処）。読み込み直しを始めた後のエラーとログも送らない（理由は [architecture.md](architecture.md#pwa) の「デプロイで消えた旧版のコード」）。
  - トレース: 起動と画面の移動をルート名で計り（`tanstackRouterBrowserTracingIntegration`）、API への要求にトレースの見出し（`sentry-trace`・`baggage`。同じオリジンなので既定で付く）を付けてサーバーのスパンと 1 本に繋ぐ。
    - API への要求は画面の移動のスパンの子にせず、それぞれを 1 つのスパンにする（トレースは同じ）。理由は `src/lib/api.ts` の `apiRequestFetch`。
  - ログ: `console` に出したものをすべて送る。
  - `release` はビルドしたコミット。デプロイのたびに、前のリリースからのコミットを紐付ける（上の `deploy.yml`）。ソースマップは `build.sourcemap: 'hidden'` で作り、デプロイ前に Sentry へ送ってから消す（公開しない）。
- 誰の操作で起きたかを追えるよう、エラー・スパン・ログに DB のユーザー ID（UUID）を付ける。ID はそれ自体では個人を指さず（仮名）、誰かは DB か、ユーザー管理の編集画面に出る ID と見比べて確かめる。メールアドレス（やそのハッシュ）にしないのは、MCP のアクセストークンがユーザー ID しか持たず、要求のたびに DB から読むことになるため。
  - サーバー: ログインが要る経路の認証（画面の API の `authenticate`（`server/lib/trpc.ts`）と MCP のアクセストークンの検証）が、要求ごとのスコープに付ける（`server/lib/sentry.ts` の `setSentryUser`）。
  - ブラウザ: `me.get` の `id` を、ログイン中のユーザー（`meQueryOptions` のキャッシュ）が変わるたびに付け直す（`src/lib/sentry.ts` の `watchUser`）。
- 送らないもの（`shared/sentry.ts` の `SENTRY_DATA_COLLECTION`。サーバーとブラウザで共通）: 要求・応答の本文、クエリ文字列、Cookie、IP アドレス、DB の問い合わせの引数と結果、例外の時点のローカル変数。SDK の既定はこれらも集めるが、家庭の記録（予定・立替の金額・メモ）やパスワード、OAuth の認可コードを外のサービスに渡さない。見出し（ヘッダ）は送るが、`Authorization` などの秘密は SDK が伏せる。何が起きたかはルート名・所要時間・ステータス・スタックトレースで追える。
- 無料枠（月 5,000 エラー・5M スパン・ログ 5GB・稼働監視 1 つ）に収める:
  - エラー: DSN に 150 件/日の上限を掛ける（150 × 31 < 5,000）。無料プランは枠を超えても課金されず捨てられるだけだが、1 つの不具合が月の枠を使い切ると残りのエラーが見えなくなるため、日ごとに区切る。DSN の上限が効くのはエラーだけ。
  - スパン: すべて送る（`tracesSampleRate: 1`）。1 回の起動（リソースの読み込みを含む）で数十、要求 1 つで 10〜20 程度（Neon への問い合わせ 1 回が DB と HTTP の 2 つ）なので、2 人の利用なら月に数十万で枠の 1〜2 割。間引くと 2 人の少ない操作のトレースが欠けて役に立たないので、間引かない。
  - ログ: `console` への出力はエラーと通知の失敗くらいで、枠に対して桁違いに少ない。
- 稼働監視は `/api/health`（API と DB が応答するか）を 30 分ごとに外から確かめ、2 回続けて失敗したら課題にする。DB に問い合わせるたびに Neon のコンピュートが起きるので、間隔を空けて Neon の無料枠を食わないようにしている。
- 新しい課題はプロジェクト作成時の既定のアラート（新しい課題ごとにメール）で届く。

## 運用上の注意

- マイグレーションは後方互換を保つ（列削除は「アプリが参照をやめたデプロイ」の次のデプロイで行う）。
- ロールバックはアプリ側は `vercel rollback`、インフラ側は Terraform の変更を revert してプッシュ。
- 無料枠の制約: Vercel Hobby は Cron の頻度に上限（[architecture.md](architecture.md#ディレクトリ構成機能単位で凝集) の Cron）・Cron の時刻は最大 59 分ずれる・関数実行時間に上限・非商用限定、Neon Free はコンピュート自動停止・ストレージ上限、QStash Free は 1 日 1,000 メッセージ・遅延最大 7 日、Sentry Developer は月 5,000 エラー・5M スパン・ログ 5GB・稼働監視 1 つ・ユーザー 1 人。
