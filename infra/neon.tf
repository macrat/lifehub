# Neon（Postgres, Free）。main = 本番、dev = ローカル開発用。
# PR ごとの preview/pr-<番号> ブランチは寿命が短いため GitHub Actions が作成・削除する。

resource "neon_project" "lifehub" {
  name       = "lifehub"
  org_id     = var.neon_org_id
  region_id  = "aws-ap-southeast-1"
  pg_version = 17

  history_retention_seconds = 21600
}

resource "neon_branch" "dev" {
  project_id = neon_project.lifehub.id
  parent_id  = neon_project.lifehub.default_branch_id
  name       = "dev"
}

resource "neon_endpoint" "dev" {
  project_id = neon_project.lifehub.id
  branch_id  = neon_branch.dev.id
  type       = "read_write"
}

resource "neon_role" "app" {
  project_id = neon_project.lifehub.id
  branch_id  = neon_project.lifehub.default_branch_id
  name       = "lifehub"
}

resource "neon_database" "app" {
  project_id = neon_project.lifehub.id
  branch_id  = neon_project.lifehub.default_branch_id
  name       = "lifehub"
  owner_name = neon_role.app.name
}

locals {
  database_url = "postgresql://${neon_role.app.name}:${neon_role.app.password}@${neon_project.lifehub.database_host}/${neon_database.app.name}?sslmode=require"
}
