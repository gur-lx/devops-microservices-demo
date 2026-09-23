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
    tls = {
      source = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "tls" {}

resource "tls_private_key" "demo" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "demo" {
  key_name   = "jenkins-demo-server-${var.server_number}"
  public_key = tls_private_key.demo.public_key_openssh
}

resource "aws_iam_role" "ssm_instance" {
  name = "jenkins-demo-ssm-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_instance" {
  role       = aws_iam_role.ssm_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ssm_instance" {
  name = "jenkins-demo-ssm-instance-profile"
  role = aws_iam_role.ssm_instance.name
}

resource "aws_instance" "demo" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.demo.key_name
  iam_instance_profile   = aws_iam_instance_profile.ssm_instance.name
  vpc_security_group_ids = [var.security_group_id]

  tags = {
    Name        = "jenkins-demo-instance"
    CreatedBy   = "jenkins-pipeline"
    BuildNumber = var.build_number
  }
}
