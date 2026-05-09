# Workflow migration: SSH → OIDC + SSM

Apply this AFTER `tofu apply` succeeds and you've confirmed the SSM agent is
running on the EC2 host (`sudo systemctl status amazon-ssm-agent`). Until then,
the SSH workflow keeps working.

## What changes in `.github/workflows/docker-build.yml`

The `deploy` job replaces both `appleboy/scp-action` and `appleboy/ssh-action`
with a single AWS-authenticated `ssm send-command`. Net effect: one fewer
secret (`EC2_SSH_KEY` goes away), no inbound SSH port required, and command
output is captured in CloudWatch Logs automatically.

### Before (current)

```yaml
deploy:
  needs: build-and-push
  runs-on: ubuntu-latest
  steps:
    - name: Checkout
      uses: actions/checkout@v6

    - name: Sync docker-compose.yml to EC2
      uses: appleboy/scp-action@v0.1.7
      with:
        host: ${{ secrets.EC2_HOST }}
        username: ubuntu
        key: ${{ secrets.EC2_SSH_KEY }}
        source: deploy/docker-compose.yml
        target: /tmp/inbox-zero-deploy/
        strip_components: 1

    - name: Deploy to EC2
      uses: appleboy/ssh-action@v1.2.0
      with:
        host: ${{ secrets.EC2_HOST }}
        username: ubuntu
        key: ${{ secrets.EC2_SSH_KEY }}
        script: |
          set -e
          sudo install -m 0644 -o root -g root /tmp/inbox-zero-deploy/docker-compose.yml /opt/inbox-zero/docker-compose.yml
          rm -f /tmp/inbox-zero-deploy/docker-compose.yml
          cd /opt/inbox-zero
          docker system prune -f --filter "until=24h"
          docker compose pull app
          docker compose up -d app
```

### After (OIDC + SSM)

```yaml
deploy:
  needs: build-and-push
  runs-on: ubuntu-latest
  permissions:
    id-token: write   # required to mint the OIDC token
    contents: read
  steps:
    - name: Checkout
      uses: actions/checkout@v6

    - name: Configure AWS credentials via OIDC
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::253610008894:role/inbox-zero-gha-deploy
        aws-region: us-east-1

    - name: Encode docker-compose.yml for transport
      id: encode
      run: |
        echo "compose_b64=$(base64 -w0 deploy/docker-compose.yml)" >> "$GITHUB_OUTPUT"

    - name: Deploy via SSM
      env:
        COMPOSE_B64: ${{ steps.encode.outputs.compose_b64 }}
      run: |
        set -euo pipefail
        CMD_ID=$(aws ssm send-command \
          --instance-ids i-0ddd8a31e870a696e \
          --document-name AWS-RunShellScript \
          --comment "inbox-zero deploy ${{ github.sha }}" \
          --parameters "commands=[\"set -e\",\"echo \\\"$COMPOSE_B64\\\" | base64 -d > /tmp/docker-compose.yml\",\"sudo install -m 0644 -o root -g root /tmp/docker-compose.yml /opt/inbox-zero/docker-compose.yml\",\"rm -f /tmp/docker-compose.yml\",\"cd /opt/inbox-zero\",\"docker system prune -f --filter until=24h\",\"docker compose pull app\",\"docker compose up -d app\"]" \
          --query Command.CommandId \
          --output text)
        echo "Sent SSM command $CMD_ID, polling..."
        # Wait for completion (poll every 5s, up to 5 min).
        for i in {1..60}; do
          STATUS=$(aws ssm get-command-invocation \
            --command-id "$CMD_ID" \
            --instance-id i-0ddd8a31e870a696e \
            --query Status --output text 2>/dev/null || echo "Pending")
          echo "  status: $STATUS"
          case "$STATUS" in
            Success) exit 0 ;;
            Cancelled|TimedOut|Failed) 
              aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id i-0ddd8a31e870a696e
              exit 1 ;;
          esac
          sleep 5
        done
        echo "Timed out waiting for SSM command" >&2
        exit 1
```

The compose file rides inline as a base64 blob in the SSM command parameters
instead of needing a separate scp step. SSM SendCommand has a 4 KB limit per
parameter and a 100 KB total — the compose file is ~2 KB, plenty of headroom.

## Cleanup after the new workflow goes green

1. Remove `EC2_SSH_KEY` from the GitHub repo secrets.
2. Remove `EC2_HOST` if it's no longer used elsewhere (the SSM workflow
   references the instance ID directly, not the hostname).
3. Optionally close port 22 in the EC2 security group:
   ```
   aws ec2 revoke-security-group-ingress --group-id sg-XXXX --protocol tcp --port 22 --cidr 0.0.0.0/0
   ```
   You can still SSH via SSM Session Manager (`aws ssm start-session --target i-...`)
   without an open port.

## Rollback

If the SSM deploy fails, the old SSH-based workflow still works as long as
`EC2_SSH_KEY` is still in GitHub secrets and port 22 is open. Keep both for
one or two deploys before removing the SSH path.
