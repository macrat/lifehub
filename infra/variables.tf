# 外部から渡す資格情報。GitHub Secrets → TF_VAR_* として渡す（README の初回セットアップを参照）。
#
# GitHub Secrets から来る値はすべて sensitive にする。リポジトリは public で、CI は terraform plan の
# 結果を PR コメントに貼る。Actions のログは Secrets の値を伏せるが、コメントに貼った plan は伏せない。

variable "vercel_api_token" {
  type      = string
  sensitive = true
}

variable "neon_api_key" {
  type      = string
  sensitive = true
}

# Neon の組織 ID（org-...）。プロジェクトは組織の下に作る（個人アカウントも組織として扱われる）
variable "neon_org_id" {
  type      = string
  sensitive = true
}

# Vercel のチーム（slug か ID）。Hobby でもアカウントはチームなので、プロジェクトはその下に作る
variable "vercel_team" {
  type      = string
  sensitive = true
}

# Sentry の User Auth Token（プロジェクト・キー・監視を作るので Organization Token では足りない）
variable "sentry_auth_token" {
  type      = string
  sensitive = true
}

# Sentry の組織（slug）。URL の https://<slug>.sentry.io の部分
variable "sentry_organization" {
  type    = string
  default = "blanktar"
}

variable "qstash_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "qstash_current_signing_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "qstash_next_signing_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "vapid_public_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "vapid_private_key" {
  type      = string
  sensitive = true
  default   = ""
}

# Money Forward の取り込み（server/features/money/）。口座の書き方は server/lib/env.ts の moneyAccountsSchema
variable "moneyforward_email" {
  type      = string
  sensitive = true
  default   = ""
}

variable "moneyforward_password" {
  type      = string
  sensitive = true
  default   = ""
}

# 2 段階認証（認証アプリ）を使っていなければ空のまま
variable "moneyforward_totp_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "moneyforward_accounts" {
  type      = string
  sensitive = true
  default   = ""
}

variable "vapid_subject" {
  type    = string
  default = "mailto:m@crat.jp"
}

variable "domain" {
  type    = string
  default = "lifehub.crat.jp"
}
