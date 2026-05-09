variable "aws_region" {
  description = "AWS region the EC2 host lives in."
  type        = string
  default     = "us-east-1"
}

variable "github_repo" {
  description = "GitHub repository in 'owner/name' form. Trust policy is scoped to pushes on main of this repo only."
  type        = string
}

variable "github_branch" {
  description = "Branch ref the OIDC trust policy allows. Defaults to main; set to '*' only if you understand the blast radius."
  type        = string
  default     = "main"
}

variable "ec2_instance_id" {
  description = "EC2 instance ID the deploy role is allowed to send SSM commands to."
  type        = string
}

variable "ec2_instance_role" {
  description = "Name of the existing IAM role attached to the EC2 instance profile (for attaching AmazonSSMManagedInstanceCore)."
  type        = string
}

variable "create_oidc_provider" {
  description = "Whether to create the IAM OIDC provider for GitHub Actions. Set false if it already exists in this AWS account."
  type        = bool
  default     = true
}

variable "role_name" {
  description = "Name of the IAM role GitHub Actions assumes via OIDC."
  type        = string
  default     = "inbox-zero-gha-deploy"
}
