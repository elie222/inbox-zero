# Self-Hosting Inbox Zero with Docker on a VPS

This guide will walk you through self-hosting the Inbox Zero application on a VPS using Docker and Docker Compose.

## Prerequisites

### Requirements

- VPS with Minimum 2GB RAM, 2 CPU cores, 20GB storage and linux distribution with [minimum security](https://help.ovhcloud.com/csm/en-gb-vps-security-tips?id=kb_article_view&sysparm_article=KB0047706)
- Domain name pointed to your VPS IP
- SSH access to your VPS

## Step-by-Step VPS Setup

### 1. Prepare Your VPS

Connect to your VPS and install Docker Engine by following the [the official guide](https://docs.docker.com/engine/install) and the [Post installation steps](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)

### 2. Setup Docker Compose

Create a directory for your Inbox Zero installation:

```bash
mkdir inbox-zero
cd inbox-zero
```

Download the docker-compose.yml file:

```bash
curl -O https://raw.githubusercontent.com/elie222/inbox-zero/main/docker-compose.yml
```

### 3. Configure

Create environment file:

```bash
mkdir -p apps/web
curl -o apps/web/.env https://raw.githubusercontent.com/elie222/inbox-zero/main/apps/web/.env.example
```

Edit the environment file with your production settings:

```bash
nano apps/web/.env
```

For detailed configuration instructions including all required environment variables, OAuth setup, and LLM configuration, see the [main README.md configuration section](../../README.md#updating-env-file-secrets).

**Important**: The `NEXT_PUBLIC_BASE_URL` must be set as a shell environment variable when running `docker compose up` (as shown below). Setting it in `apps/web/.env` will not work because `docker-compose.yml` overrides it.

### 4. Deploy

Pull and start the services with your domain:

```bash
# Set your domain and start all services
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose up -d
```

The pre-built Docker image is hosted at `ghcr.io/elie222/inbox-zero:latest` and will be automatically pulled.

### 5. Run Database Migrations

Wait for the containers to start, then run the database migrations:

```bash
# Wait a few seconds for the database to be ready, then run migrations
docker compose exec web npx prisma migrate deploy
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

## Updates

To update to the latest version:

```bash
# Pull the latest image
docker compose pull web

# Restart with the new image
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose up -d

# Run any new database migrations
docker compose exec web npx prisma migrate deploy
```
## Monitoring

```bash
# View logs
docker compose logs -f web
docker compose logs -f db
```

## Building from Source (Optional)

If you prefer to build the image yourself instead of using the pre-built one:

```bash
# Clone the repository
git clone https://github.com/elie222/inbox-zero.git
cd inbox-zero

# Configure environment
cp apps/web/.env.example apps/web/.env
nano apps/web/.env

# Build and start
docker compose build
NEXT_PUBLIC_BASE_URL=https://yourdomain.com docker compose up -d
```

**Note**: Building from source requires significantly more resources (4GB+ RAM recommended) and takes longer than pulling the pre-built image.

