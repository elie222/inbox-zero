# Self-Hosting Inbox Zero with Docker on a VPS

This guide will walk you through self-hosting the Inbox Zero application on a VPS using Docker and Docker Compose.

## Prerequisites

### Requirements

- VPS with Minimum 2GB RAM, 2 CPU cores, 20GB storage and linux distribution and [minimum security](https://help.ovhcloud.com/csm/en-gb-vps-security-tips?id=kb_article_view&sysparm_article=KB0047706)
- Domain name pointed to your VPS IP
- SSH access to your VPS

## Step-by-Step VPS Setup

### 1. Prepare Your VPS

Connect to your VPS and install Docker Engine by following the [the official guide](https://docs.docker.com/engine/install) and the [Post installation steps](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)

### 2. Clone

```bash
# Clone the repository
git clone https://github.com/elie222/inbox-zero.git
cd inbox-zero
```

### 3. Configure

Create environment file

```bash
cp apps/web/.env.example apps/web/.env
```

and edit with your production settings.

For detailed configuration instructions including all required environment variables, OAuth setup, and LLM configuration, see the [main README.md configuration section](../../README.md#L107).

### 4. Build and Deploy

Build the inbox-zero image with your domain name:

```bash
# Build with your custom domain
docker compose build --build-arg NEXT_PUBLIC_BASE_URL=https://yourdomain.com
```

Start the services:

```bash
# Start all services in detached mode
docker compose --env-file ./apps/web/.env up -d
```

### 5. Run Database Migrations

In another terminal, run the database migrations :

```bash
# Run Prisma migrations
docker compose exec web pnpm --filter inbox-zero-ai exec -- prisma migrate deploy
```

### 6. Setup Nginx

Install and configure Nginx as reverse proxy:

```bash
# Install Nginx
sudo apt update
sudo apt install nginx
```

Create Nginx configuration file (replace `yourdomain.com` with your domain):

```bash
sudo vim /etc/nginx/sites-available/yourdomain.com
```

Add the following configuration:

```nginx
server {
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
    }
}
```

Enable the site:

```bash
# Disable default configuration
sudo rm /etc/nginx/sites-enabled/default

# Enable the configuration
sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/yourdomain.com

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 7. Setup SSL Certificate

Install Certbot and generate SSL certificate:

```bash
# Install Certbot using snap
sudo apt install snapd
sudo snap install --classic certbot

# Generate SSL certificate (replace yourdomain.com with your domain)
sudo certbot --nginx -d yourdomain.com

# Reload Nginx to apply SSL configuration
sudo nginx -s reload
```

### Updates

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose build --build-arg NEXT_PUBLIC_BASE_URL=https://yourdomain.com
docker compose up -d
```
### Monitoring

```bash
# View logs
docker compose logs -f web
docker compose logs -f db
```

