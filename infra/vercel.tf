# Vercel（Hobby）。git_repository は設定せず、デプロイは GitHub Actions が行う。

resource "vercel_project" "lifehub" {
  name      = "lifehub"
  framework = "vite"

  build_command    = "pnpm build"
  install_command  = "pnpm install --frozen-lockfile"
  output_directory = "dist"

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
  # production / preview の両方に設定する環境変数。
  # DATABASE_URL は preview ではデプロイ時に PR ブランチの値で上書きされる。
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
  target     = ["production", "preview"]
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
