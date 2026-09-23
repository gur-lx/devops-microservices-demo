variable "aws_region" {
  description = "Region to create the instance in -- match wherever your existing servers already live"
  type        = string
  default     = "us-east-1"
}

variable "ami_id" {
  description = "AMI to launch -- use the same Ubuntu AMI your existing servers use (AWS Console -> EC2 -> Instances -> your server -> AMI ID)"
  type        = string
}

variable "instance_type" {
  description = "Keep this small -- it's a demo instance, not a real server"
  type        = string
  default     = "t3.micro"
}

variable "server_number" {
  description = "Stable server number used in the generated AWS key-pair name and PEM filename"
  type        = string
  default     = "1"
}

variable "security_group_id" {
  description = "Existing security group ID to attach (sg-xxxxxxxx)"
  type        = string
}

variable "build_number" {
  description = "Jenkins build number, passed in for tagging only"
  type        = string
  default     = "manual"
}
