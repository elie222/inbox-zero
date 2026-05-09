data "aws_caller_identity" "current" {}

# IAM OIDC provider for GitHub Actions.
# AWS publishes the thumbprint at
# https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#adding-the-identity-provider-to-aws
# The aws-actions/configure-aws-credentials action also documents that AWS
# now validates GitHub's certificate chain against the trust store, so the
# thumbprint is effectively unused — but the API still requires it.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  branch_subject    = "repo:${var.github_repo}:ref:refs/heads/${var.github_branch}"
}

# Trust policy: only GitHub Actions running on the configured branch of the
# configured repo can assume this role. The `aud` claim must equal sts.amazonaws.com
# (set by configure-aws-credentials) and the `sub` claim must match the branch.
data "aws_iam_policy_document" "gha_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.branch_subject]
    }
  }
}

resource "aws_iam_role" "gha_deploy" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.gha_trust.json
  description        = "Assumed by GitHub Actions via OIDC to deploy inbox-zero to EC2 via SSM."
}

# Permission policy: only SSM SendCommand to the specific instance, only the
# AWS-RunShellScript document, and only enough to read back the result.
data "aws_iam_policy_document" "gha_deploy" {
  statement {
    sid    = "SendCommandToInstance"
    effect = "Allow"
    actions = [
      "ssm:SendCommand",
    ]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${var.ec2_instance_id}",
      "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid    = "ReadCommandStatus"
    effect = "Allow"
    actions = [
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "gha_deploy" {
  name   = "${var.role_name}-policy"
  role   = aws_iam_role.gha_deploy.id
  policy = data.aws_iam_policy_document.gha_deploy.json
}

# Ensure the EC2 instance role has the SSM core policy attached. Without this
# the agent can't register with SSM and SendCommand will fail with
# InvalidInstanceId. Idempotent — no-op if already attached.
resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  role       = var.ec2_instance_role
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
