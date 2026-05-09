# Terraform / OpenTofu — GitHub Actions OIDC + SSM Deploy

Provisions the AWS resources needed to retire the long-lived `EC2_SSH_KEY` GitHub
Actions secret and replace it with short-lived OIDC-issued STS credentials. The
deploy mechanism switches from SSH to SSM `SendCommand`, which means port 22
can also be closed in the EC2 security group once this is wired up.

## What this creates

- **IAM OIDC provider** for `token.actions.githubusercontent.com` (one per AWS
  account — skip with `create_oidc_provider = false` if you already have one).
- **IAM role** `inbox-zero-gha-deploy` with a trust policy restricted to
  pushes on `refs/heads/main` of `rebekah-create/inbox-zero-rebekah`.
- **Inline policy** allowing only `ssm:SendCommand` on the specific EC2 instance
  + the AWS-managed `AWS-RunShellScript` document, plus `ssm:GetCommandInvocation`
  for status polling. Nothing else.
- **IAM instance profile policy attachment** to ensure the EC2 role
  (`inbox-zero-role` per the existing setup) has `AmazonSSMManagedInstanceCore`
  attached. This is what lets SSM RunCommand reach the box.

## Inputs

Set these in `terraform.tfvars` (gitignored — never commit it):

```hcl
github_repo          = "rebekah-create/inbox-zero-rebekah"
ec2_instance_id      = "i-0ddd8a31e870a696e"
ec2_instance_role    = "inbox-zero-role"
aws_region           = "us-east-1"
create_oidc_provider = true   # false if the provider already exists in this account
```

## Apply

```bash
cd deploy/terraform
tofu init
tofu plan -out plan.out
tofu apply plan.out
```

Outputs include `gha_deploy_role_arn` — copy that into the GitHub Actions
workflow as `role-to-assume`.

## After apply

1. Confirm SSM agent is running on the box:
   `sudo systemctl status amazon-ssm-agent` — should be `active (running)`. If
   it's not installed: `sudo snap install amazon-ssm-agent --classic` (Ubuntu)
   or follow the AWS docs.
2. Update `.github/workflows/docker-build.yml` to assume the role and use
   `aws ssm send-command` instead of `appleboy/ssh-action`. Sample diff is in
   `WORKFLOW-MIGRATION.md`.
3. Remove the `EC2_SSH_KEY` secret from the GitHub repo settings.
4. Optionally close port 22 in the EC2 security group — SSM tunnels through the
   agent's outbound HTTPS connection, no inbound SSH needed.

## Why SSM, not SSH-with-OIDC

There's no native way to have GitHub OIDC mint an SSH key for an EC2 instance.
You can put SSH keys in Secrets Manager and rotate them, but you'd still need
some auth path to fetch them. SSM RunCommand replaces SSH entirely with an
AWS-IAM-authorized control plane — short-lived STS creds in, command run on the
box, output returned. No long-lived key material.
