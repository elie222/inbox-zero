# AWS EC2 Deployment Guide

This guide covers setting up Inbox Zero on AWS EC2 with ALB.

**Note:** This is a reference implementation. There are many ways to deploy on AWS (ECS, EKS, Elastic Beanstalk, etc.). Use what works best for your infrastructure and expertise.

## 1. Launch Instance

1.  **Go to EC2 Console** and click **Launch Instances**.
2.  **Name:** `inbox-zero` (or whatever you like)
3.  **OS / AMI:**
    *   Select **Amazon Linux 2023** (Kernel 6.1 LTS).
4.  **Instance Type:**
    *   **Test:** `t2.micro` or `t3.micro` (Free Tier, 1GB RAM).
        *   *Warning:* You **must** set up swap memory (see below) or the app will crash.
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

#### 1. Update & Install Required Tools

```bash
sudo dnf update -y
sudo dnf install docker git -y
sudo service docker start
sudo usermod -a -G docker ec2-user
# You must log out and log back in for group changes to take effect
exit
```

#### 2. Install Node.js (Required if using setup CLI)

After logging back in, install Node.js:

**Note:** this is only needed if you want to run the setup CLI:

```bash
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo dnf install -y nodejs
```

#### 3. Install Docker Compose

```bash
mkdir -p ~/.docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose
# Verify it works
docker compose version
```

#### 4. Setup Swap Memory (CRITICAL for Micro Instances)
If you are using a `t2.micro` or `t3.micro` (1GB RAM), you MUST add swap or the build/runtime will crash.

```bash
# Create a 4GB swap file
sudo dd if=/dev/zero of=/swapfile bs=128M count=32
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

## 3. SSL/HTTPS Setup

### Application Load Balancer (ALB)

You can also use nginx or any approach of your choice.

1.  **Request SSL Certificate (AWS Certificate Manager):**
    *   Go to **AWS Certificate Manager** console
    *   Click **Request certificate** → **Request a public certificate**
    *   Enter your domain name (e.g., `app.yourdomain.com`)
    *   Choose **DNS validation** (easier) or **Email validation**
    *   Follow validation steps: AWS will provide a CNAME record to add to your DNS. Once added, the certificate will be issued in 5-10 minutes.
    *   Wait for certificate status to show **Issued**

2.  **Create Target Group:**
    *   Go to **EC2 Console** → **Target Groups** → **Create target group**
    *   Name: e.g., `inbox-zero-web`
    *   Target type: **Instances**
    *   Protocol: **HTTP**, Port: **3000**
    *   Health check path: `/api/health`
    *   Click **Next**, select your EC2 instance, click **Include as pending below**, then **Next**, then **Create target group**

3.  **Create Application Load Balancer:**
    *   Go to **EC2 Console** → **Load Balancers** → **Create load balancer**
    *   Choose **Application Load Balancer**
    *   Name: `inbox-zero-alb`
    *   Scheme: **Internet-facing**
    *   IP address type: **IPv4**
    *   Network mapping: Select at least 2 availability zones
    *   Security groups: Create/select one that allows HTTP (80) and HTTPS (443) from anywhere
    *   **Listeners:**
        *   Add listener: **HTTPS (443)** → Forward to your target group
        *   (Optional) Add listener: **HTTP (80)** → Redirect to HTTPS
    *   **Secure listener settings**: Select your ACM certificate
    *   Click **Create load balancer**

4.  **Update DNS:**
    *   Wait for the ALB to finish provisioning (status: **Active**, takes 2-5 minutes)
    *   Find the ALB DNS name in **EC2 Console** → **Load Balancers** → click your ALB → copy the **DNS name**
    *   In your DNS provider, create a CNAME record:
        *   **Name:** Your domain/subdomain (e.g., `test` for `test.yourdomain.com` or `@` for root domain)
        *   **Target:** `<ALB-DNS-name>` (e.g., `inbox-zero-alb-123456789.us-east-1.elb.amazonaws.com`)
        *   **Proxy status:** DNS only (if using Cloudflare DNS)

5.  **Update Security Group:**
    *   Your EC2 instance security group should allow traffic from the ALB security group on port 3000
    *   Add a new port 3000 rule with source set to the ALB's security group (find it in ALB → Security tab)
    *   This allows only the ALB to access your app on port 3000, not the public internet

## 4. Deployment

Once your EC2 instance is set up with Docker, swap memory, and HTTPS, follow the deployment steps in the [Self-Hosting Guide](./self-hosting.md).
