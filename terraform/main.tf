# Minimal demo: on a successful Jenkins build, provision exactly one EC2
# instance. Deliberately not an Auto Scaling Group -- this is a proof that
# Jenkins can drive infrastructure-as-code, not a scaling system.
#
# State is local (terraform.tfstate, gitignored), living in the Jenkins job's
# workspace -- which persists across builds since nothing in the Jenkinsfile
# wipes it. Running this again just converges to the same one instance
# (updates its tags, doesn't create a second one) -- that's normal Terraform
# behavior, not a bug: re-running `terraform apply` is supposed to be a no-op
# when nothing changed.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_instance" "demo" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [var.security_group_id]

  tags = {
    Name        = "jenkins-demo-instance"
    CreatedBy   = "jenkins-pipeline"
    BuildNumber = var.build_number
  }
}
