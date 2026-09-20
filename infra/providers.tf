terraform {
  required_version = ">= 1.14"

  # state は HCP Terraform（Free）に保存する。ワークスペースは Execution Mode = Local。
  cloud {
    organization = "macrat"
    workspaces {
      name = "lifehub"
    }
  }

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5.0"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.17"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "vercel" {
  api_token = var.vercel_api_token
}

provider "neon" {
  api_key = var.neon_api_key
}
