# 外部から渡す資格情報。GitHub Secrets → TF_VAR_* として渡す（README の初回セットアップを参照）。

variable "vercel_api_token" {
  type      = string
  sensitive = true
}

variable "neon_api_key" {
  type      = string
  sensitive = true
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
