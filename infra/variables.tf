# 外部から渡す資格情報。GitHub Secrets → TF_VAR_* として渡す（README の初回セットアップを参照）。

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
  type = string
}

# Vercel のチーム（slug か ID）。Hobby でもアカウントはチームなので、プロジェクトはその下に作る
variable "vercel_team" {
  type = string
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

variable "vapid_subject" {
  type    = string
  default = "mailto:m@crat.jp"
}

variable "domain" {
  type    = string
  default = "lifehub.crat.jp"
}
