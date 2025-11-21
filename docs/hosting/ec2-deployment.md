# AWS EC2 Deployment Guide

This guide covers setting up a test or production environment on AWS EC2 for Inbox Zero.

## 1. Launch Instance

1.  **Go to EC2 Console** and click **Launch Instances**.
2.  **Name:** `inbox-zero` (or whatever you like)
3.  **OS / AMI:**
    *   Select **Amazon Linux 2023** (Kernel 6.1 LTS).
4.  **Instance Type:**
    *   **Test:** `t2.med` or `t3.micro` (Free Tier).
        *   *Warning:* These have only 1GB RAM. You **must** set up swap memory (see below) or the app will crash.
    *   **Production:** `t3.medium` (4GB RAM) or larger is recommended to avoid OOM kills.
5.  **Key Pair:**
    *   Create a new key pair if you don't have one.
    *   **Name:** e.g., `inbox-zero`.
    *   **Type:** RSA, `.pem` format.
    *   **Permissions:** Run `chmod 400 ~/.ssh/your-key.pem` immediately after downloading.
6.  **Network Settings:**
    *   Allow SSH traffic from **Anywhere** (or **My IP** if you have a static IP).
        *   *Note:* Using "Anywhere" is acceptable for test servers since you're using key-based authentication. For production, consider restricting to your office IP or VPN.
    *   Allow HTTP/HTTPS traffic from the internet.
7.  **Storage:** Default (8GB) is usually fine for testing, but 20GB is safer for Docker images + logs.

## 2. Post-Launch Setup

### Elastic IP (Recommended)
EC2 public IPs change if you stop/start the instance. For a stable address:
1.  Go to **Network & Security** -> **Elastic IPs**.
2.  Click **Allocate Elastic IP address**.
3.  Select the IP -> **Actions** -> **Associate Elastic IP address**.
4.  Select your instance and associate.

### SSH Config
Add the server to your local `~/.ssh/config` to avoid typing long IPs.

```text
Host inbox-zero-test
    HostName <YOUR_ELASTIC_IP>
    User ec2-user
    IdentityFile ~/.ssh/inbox-zero.pem
```

Connect with: `ssh inbox-zero-test`

### Essential Server Setup (Amazon Linux 2023)

Once logged in, run these commands to prepare the server.

#### 1. Update & Install Docker
```bash
sudo dnf update -y
sudo dnf install docker -y
sudo service docker start
sudo usermod -a -G docker ec2-user
# You must log out and log back in for group changes to take effect
exit
```

#### 2. Setup Swap Memory (CRITICAL for Micro Instances)
If you are using a `t2.micro` or `t3.micro` (1GB RAM), you MUST add swap or the build/runtime will crash.

```bash
# Create a 4GB swap file
sudo dd if=/dev/zero of=/swapfile bs=128M count=32
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

## 3. Deployment

Once your EC2 instance is set up with Docker and swap memory, follow the deployment steps in the [Docker deployment guide](./docker.md).
