# 人が値を知る必要のない内部シークレット。Terraform が生成し state に保持する。

resource "random_password" "better_auth_secret" {
  length  = 48
  special = false
}

resource "random_password" "cron_secret" {
  length  = 48
  special = false
}

resource "random_password" "preview_auth_secret" {
  length  = 48
  special = false
}
