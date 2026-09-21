# Vercel（Hobby）。git_repository は設定せず、デプロイは GitHub Actions が行う。

resource "vercel_project" "lifehub" {
  name      = "lifehub"
  framework = "vite"

  build_command    = "pnpm build"
  install_command  = "pnpm install --frozen-lockfile"
  output_directory = "dist"

  # VERCEL_ENV / VERCEL を実行時に渡す。本番かどうかの判定（server/lib/env.ts）と DB ドライバの
  # 選択（server/lib/db.ts）がこれを読む。露出していないと本番判定が false に倒れ、必須の環境変数の
  # 検査も通知の予約も黙って行われなくなるので、既定に任せず明示する。
  automatically_expose_system_environment_variables = true

  # Preview URL を Vercel 認証で保護する
  vercel_authentication = {
    deployment_type = "standard_protection_new"
  }
}

resource "vercel_project_domain" "lifehub" {
  project_id = vercel_project.lifehub.id
  domain     = var.domain
}

locals {
  # 本番の秘密情報は Preview のビルドや実行環境に渡さない。
  env_vars = {
    DATABASE_URL               = local.database_url
    BETTER_AUTH_SECRET         = random_password.better_auth_secret.result
    CRON_SECRET                = random_password.cron_secret.result
    QSTASH_TOKEN               = var.qstash_token
    QSTASH_CURRENT_SIGNING_KEY = var.qstash_current_signing_key
    QSTASH_NEXT_SIGNING_KEY    = var.qstash_next_signing_key
    VAPID_PUBLIC_KEY           = var.vapid_public_key
    VAPID_PRIVATE_KEY          = var.vapid_private_key
    VAPID_SUBJECT              = var.vapid_subject
  }
}

resource "vercel_project_environment_variable" "shared" {
  for_each = local.env_vars

  project_id = vercel_project.lifehub.id
  key        = each.key
  value      = each.value
  target     = ["production"]
  sensitive  = true
}

# 本番だけは公開 URL を独自ドメインに固定する（Preview は VERCEL_URL から導出する）。
resource "vercel_project_environment_variable" "base_url" {
  project_id = vercel_project.lifehub.id
  key        = "APP_URL"
  value      = "https://${var.domain}"
  target     = ["production"]
  sensitive  = false
}

# Preview の DATABASE_URL は CI が PR ごとの接続先をデプロイ時に渡す。
resource "vercel_project_environment_variable" "preview_auth_secret" {
  # 同じキーの Preview 設定が重複しないよう、共有設定からの切り離しを先に行う。
  depends_on = [vercel_project_environment_variable.shared["BETTER_AUTH_SECRET"]]

  project_id = vercel_project.lifehub.id
  key        = "BETTER_AUTH_SECRET"
  value      = random_password.preview_auth_secret.result
  target     = ["preview"]
  sensitive  = true
}
