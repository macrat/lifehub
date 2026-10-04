# ドキュメント

どの文書に何を書くかの決まり。書き足す前に、ここで置き場所を決める。

## 文書の一覧

| 文書 | 書くこと | 書かないこと（書く場所） |
|---|---|---|
| [architecture.md](architecture.md) | ソフトウェアの設計: 技術の選定と理由、層と依存の向き、ディレクトリ構成、認証の境界、キャッシュ・書き込み・オフラインの仕組み、PWA | 画面の見た目と操作（ui.md）、インフラ・CI/CD・監視（operations.md）、コードの書き方（development.md）、個々の機能の振る舞い（features/） |
| [ui.md](ui.md) | どの機能にも共通する画面の約束事: 見た目、ナビゲーション、一覧、記録のシート、読み込みとアニメーション、タッチ操作 | 1 つの画面にだけある見た目と操作（features/） |
| [data-model.md](data-model.md) | 表の一覧と、どの表にも共通する規約（主キー、日時、監査列、索引、問い合わせの回数） | 列の意味から画面に出す値を導く計算（features/） |
| [development.md](development.md) | コードを書くときの規約と、それを強制する lint・型・テスト、コミット、依存の取り込み | 層と依存の向き（architecture.md） |
| [operations.md](operations.md) | 環境、初回セットアップ、Terraform、デプロイフロー、バックアップ、監視、運用上の注意。インフラ・CI/CD・監視は設計（どう作られているか・なぜか）と作業の両方をここに書く | アプリの設計（architecture.md） |
| [features/](features/) | 機能ごとの目的・画面・規則・データ・API・MCP ツール | 複数の機能に共通すること（上の各文書） |
| [../README.md](../README.md) | リポジトリの入口: 概要、ローカル開発、コマンド一覧 | 上の各文書の中身 |
| [../AGENTS.md](../AGENTS.md) | 開発全体のルール（理念と作業の約束事） | 個々の設計や手順 |
| [../.claude/skills/](../.claude/skills/) | 繰り返す作業の手順（機能追加、テストの整理など） | 設計の理由（上の各文書） |

### 機能の文書（features/）

1 つの feature（`server/features/<name>/` と `src/features/<name>/`）に 1 つの文書を置く。複数の feature を 1 つの文書にまとめてよいのは、ほかから独立して使われない補助の feature だけ。

| 文書 | 対象の feature |
|---|---|
| [home.md](features/home.md) | `timeline`（タイムライン）、`dashboard`（ホームのタイル） |
| [events.md](features/events.md) | `events`（予定とタスク） |
| [calendar.md](features/calendar.md) | `calendar`（予定画面） |
| [calendar-feeds.md](features/calendar-feeds.md) | `calendar-feeds`（ics の配信） |
| [expenses.md](features/expenses.md) | `expenses`（立替） |
| [lemon.md](features/lemon.md) | `lemon`（レモンの世話） |
| [memos.md](features/memos.md) | `memos`（メモ） |
| [weather.md](features/weather.md) | `weather`（天気） |
| [holidays.md](features/holidays.md) | `holidays`（祝日） |
| [notifications.md](features/notifications.md) | `notifications`（通知の予約と配信）、`push`（購読と送信） |
| [users.md](features/users.md) | `users`（ユーザー・認証） |
| [api-keys.md](features/api-keys.md) | `api-keys`（API キー）、`records`（記録投入の入口） |
| [mcp.md](features/mcp.md) | MCP サーバー（`server/mcp.ts`、`server/lib/mcp/`、各 feature の `mcp.ts`） |
| [mcp-events.md](features/mcp-events.md) | `mcp-events`（MCP Events の購読と webhook 配信） |

機能の文書は次の見出しをこの順で持つ。どの文書も同じ順に並ぶので、読む人は探す場所を迷わない。

1. 目的（必ず置く）
2. 画面（画面を持たない機能は省く）
3. 機能に固有の規則（見出しは内容に合わせて自由に付け、いくつ並べてもよい）
4. データ
5. API（クエリのキャッシュなど、API を読む側の決まりは子の見出しにする）
6. MCP ツール（必ず置く。無ければ「無し。」と、代わりに何で扱えるかを書く）
7. 通知（通知を出す機能だけ）
8. ホーム（ホームのタイル・タイムラインに出る機能だけ）

データ・API を持たない機能は、見出しを残して「無し。」と何を読むかを書く。例外は MCP そのものの文書（mcp.md）で、エンドポイントとツール一覧を持つ。

## 置き場所の決め方

- **1 つの事柄は 1 か所にだけ書く**。ほかの文書からはリンクで指し、中身を書き写さない。前後の文を読むのに要る 1 文の前提は書いてよいが、理由や細部はリンク先に任せる。
- **機能をまたぐ事柄は、データと規則を持つ側に書く**。ある画面が別の機能のデータを出すときは、取得・保存・規則を持ち主の機能の文書に、画面での出し方を出す側の文書に書く（例: 天気の取得とアイコンは weather.md、予定画面の日付の横での出し方は calendar.md）。
- **2 つ以上の機能で同じ約束事を使うなら、共通の文書へ上げる**。画面の約束事は ui.md、仕組みは architecture.md。機能の文書にはその機能での使い方だけを残す。
- **設計と作業を分ける**。アプリの「どう作られているか・なぜか」は architecture.md と features/、「人が何をするか」（セットアップ、デプロイ、復旧、依存の更新）は operations.md と development.md、繰り返す手順は skills に書く。例外はインフラ・CI/CD・監視で、設計も operations.md に書く（作業と同じ物を扱い、分けると同じ構成を 2 か所で説明することになるため）。
- 節の主語が文書の題と違うもの（別の feature のディレクトリ、インフラ、CI）になったら、置き場所を間違えている。上の表で書く場所を選び直す。

## 書き方

- 1 つの箇条には 1 つの事柄を書く。理由・例外・実装の場所が続いて長くなったら、子の箇条に分ける。
- WHY と WHY NOT は「WHY NOT 〜:」のように明示する。経緯や試行錯誤は書かない（[AGENTS.md](../AGENTS.md) の「記録のルール」）。
- コードを指すときはパスと名前（`src/lib/screen-data.ts` の `useScreenHistory`）を書く。
- 節を移したり見出しを変えたりしたら、リンクの切れを直す。ドキュメント・コードのコメント・スキルから `docs/` を指している所を検索して直す。
