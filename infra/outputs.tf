output "vercel_org_id" {
  value = vercel_project.lifehub.team_id
}

output "vercel_project_id" {
  value = vercel_project.lifehub.id
}

output "dns_cname_target" {
  description = "外部 DNS の lifehub.crat.jp CNAME に登録する値"
  value       = "cname.vercel-dns.com"
}

output "database_url" {
  value     = local.database_url
  sensitive = true
}

output "neon_project_id" {
  value = neon_project.lifehub.id
}
