# 開発規約

コードを書くときの規約と、それを強制する仕組み。層と依存の向き（どこから何を import してよいか）は設計の一部なので [architecture.md](architecture.md#レイヤー構成) に書く。手を動かす順番は [.claude/skills/creating-new-feature/SKILL.md](../.claude/skills/creating-new-feature/SKILL.md)。

## 型と lint

- TypeScript は `strict: true`、`noUncheckedIndexedAccess: true`。`any` は禁止。
- lint と format は Biome、未使用のファイル・export・依存の検出は knip で、どちらも CI で強制する（`pnpm lint`）。警告ゼロを維持する。
- **import の循環**は Biome の `noImportCycles` が禁じる（型だけの import は数えない）。
  - WHY: 循環は、どれかのモジュールが読み込みの時点で相手を使う形に変わった途端に初期化の順序で壊れ、原因が import の順に隠れて見つけにくい。
  - 止められたら、互いに呼び合う片方の読み出しを依存の少ない側へ移す（例: 終日の通知時刻は `features/notifications/repository.ts`）。
- **`.tsx` はコンポーネントだけを export する**（Biome の `useComponentExportOnlyModules`）。定数・関数は隣の `.ts` に置く（例: `lib/ui/layout.ts`、`features/expenses/format.ts`）。
  - WHY: Vite の Fast Refresh はコンポーネントだけの module でしか効かず、混ぜると編集のたびに画面ごと読み直しになる。
  - ルートの file（`Route` を export し、コンポーネントは router の `autoCodeSplitting` が別の module に切り出す）と `main.tsx`（入口）は対象外。
- Terraform も対象: `terraform fmt -check` と `terraform validate` を CI で強制する。

## ファイルと関数の大きさ

- 1 file は 400 行、1 関数は 100 行まで（Biome の `noExcessiveLinesPerFile`・`noExcessiveLinesPerFunction`）。
- 関数は中央値が 1 桁、99% が 100 行未満に収まるので、それを超える関数は責務を 2 つ以上抱えているとみなす。
- 超えたら上限を上げずに、関心ごとに分ける。状態と操作はフック（`use-*.ts`）へ、表示は小さな部品へ、React に依らない仕組みは素の TS へ。
- テスト（`__tests__/`・`e2e/`）にも file の上限を同じ値で掛ける。関数の行数は数えない（`describe`・`test` のコールバックは場合を並べる入れ物で、長さが処理の複雑さを表さないため）。

## テスト

- Service 層（特に繰り返し展開・精算の計算・通知列挙）はユニットテスト必須。主要導線（ログイン → 記録追加 → ホーム反映）は E2E で確かめる。
- テストが長くなったら、確かめる関心ごと（対象の関数の群れ、画面の操作の種類）で file を分ける。共有する準備と略記は隣の補助 file（例: `e2e/calendar-mobile.ts`、`__tests__/draft-fixtures.ts`）に置く。
- テスト全体で使う物は 1 か所に置いて書き写さない。

| 用途 | 置き場所 |
|---|---|
| 日時を JST で書く略記（`jst` / `iso`） | `shared/__tests__/jst.ts` |
| サーバーのテストのユーザー（自分 A と相手 B） | `server/lib/db/test-db.ts` の `createTestUser` |
| ログインして Cookie を得る手順 | `server/__tests__/login.ts`（`signIn` / `cookieOf` / `loginAs`） |
| E2E のログイン済みの状態 | `e2e/auth.setup.ts`（1 度だけログインして保存する。E2E はこの状態から始まる） |
| E2E のログインしていない状態・ホームを開く手順 | `e2e/auth.ts`（`SIGNED_OUT` / `openHome`） |
| E2E で確かめる操作の前に予定や記録を置く手順 | `e2e/events.ts`（`addItem`）、`e2e/history.ts`（`addRecord`）、`e2e/api.ts`（`apiOf`。画面の API を型付きで呼ぶ） |

## コミット

- コミットは Conventional Commits。PR 単位で機能を追加する。
- メッセージには WHY と WHY NOT を詳しく書く（[AGENTS.md](../AGENTS.md)）。

## 依存の取り込み

- 依存の更新は Dependabot（`.github/dependabot.yml`）が npm のみ・週次・まとめて 1 PR で提案し、マージは人が判断する。
- GitHub Actions と Terraform は Dependabot の対象外。Terraform のプロバイダ更新はリソース再作成の事故を避けるため、バージョン制約を編集する PR で行う（[operations.md](operations.md#terraforminfra)）。
- **npm パッケージは公開から 3 日以上経ったものだけを取り込む**。乗っ取られたアカウントからの publish が発覚・取り下げされるまでの猶予を取り、サプライチェーン攻撃を避けるため。
  - Dependabot は pnpm の設定を読まない別の解決系なので、経路ごとに同じ猶予を書く。pnpm は `pnpm-workspace.yaml` の `minimumReleaseAge: 4320`（分）、Dependabot は `.github/dependabot.yml` の `cooldown.default-days: 3`。
  - この猶予が効かない経路が 2 つある。CI の `pnpm install --frozen-lockfile` は解決済みのロックファイルをそのまま入れるので再検査しない。Dependabot の security updates は仕様上 cooldown の対象外で、即座に PR が作られる。
