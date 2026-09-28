# Sentry（Developer = 無料プラン）。エラー・トレース・ログの収集と、本番の死活監視。
#
# 無料枠（月 5,000 エラー・5M スパン・ログ 5GB・稼働監視 1 つ）を超えないよう、ここと SDK の設定
# （server/lib/sentry.ts・src/lib/sentry.ts）の両方で絞る。無料プランは枠を超えても課金されず、
# 超えた分が捨てられるだけだが、1 つの不具合が枠を使い切るとその月の残りが見えなくなる。
# - エラーは DSN（sentry_key）に日ごとの上限を掛け、1 日で使える量を月の枠の 1/31 以下にする。
#   DSN の上限が効くのはエラーだけ。スパンとログは 2 人の利用では枠に対して十分少ない（docs/architecture.md）。
# - セッションリプレイ（月 50 件）とプロファイリング（無料枠に無い）は SDK で有効にしない。
# - 稼働監視は 1 つだけ。

resource "sentry_team" "lifehub" {
  organization = var.sentry_organization
  name         = "lifehub"
  slug         = "lifehub"
}

# ブラウザとサーバーのエラーを 1 つのプロジェクトに集める。枠は組織で共有なので分けても枠は増えず、
# どちらの SDK から来たかはイベントに残る。
resource "sentry_project" "lifehub" {
  organization = var.sentry_organization
  teams        = [sentry_team.lifehub.slug]
  name         = "lifehub"
  slug         = "lifehub"
  platform     = "javascript-react"

  # 既定のキーはレート制限を持たないので作らせず、下の sentry_key だけを使う
  default_key = false
}

resource "sentry_key" "lifehub" {
  organization = var.sentry_organization
  project      = sentry_project.lifehub.slug
  name         = "lifehub"

  # 150 件/日 × 31 日 = 4,650 件 < 月 5,000 件。同じ不具合が繰り返し起きても、その日の分を使い切ったら
  # 止まり、翌日には新しいエラーがまた届く。
  rate_limit_window = 86400
  rate_limit_count  = 150
}

# 本番の API と DB が応答するかを外から確かめる。落ちたら Sentry の課題になり、メールで届く。
# /api/health は DB に問い合わせるので、確かめるたびに Neon のコンピュートが起きる（Neon は 5 分使われないと止まる）。
# 間隔を 30 分にして起きている時間を 1/6 程度に抑え、Neon の無料枠のコンピュート時間を食い潰さないようにする。
# WHY NOT 静的なページを見る: Vercel の CDN が返すだけで、API と DB が落ちていても成功してしまう。
resource "sentry_uptime_monitor" "health" {
  organization = var.sentry_organization
  project      = sentry_project.lifehub.slug
  name         = "LifeHub /api/health"
  environment  = "production"

  url                = "https://${var.domain}/api/health"
  method             = "GET"
  interval_seconds   = 1800
  timeout_ms         = 10000
  downtime_threshold = 2

  owner = {
    team_id = sentry_team.lifehub.internal_id
  }

  assertion_json = provider::sentry::assertion(
    provider::sentry::op_status_code_check("equals", 200),
  )
}

locals {
  sentry_dsn = sentry_key.lifehub.dsn["public"]
}
