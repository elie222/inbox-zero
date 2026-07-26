# Cloud Agent base image for inbox-zero.
# Do not COPY the project — Cursor checks out the workspace separately.
FROM node:24-bookworm

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    gnupg \
    openssl \
    sudo \
  && rm -rf /var/lib/apt/lists/*

# Match root package.json packageManager
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Docker-in-Docker for postgres/redis via docker-compose.dev.yml
RUN install -m 0755 -d /etc/apt/keyrings \
  && curl --retry 3 --retry-delay 5 -fsSL https://download.docker.com/linux/debian/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
  && chmod a+r /etc/apt/keyrings/docker.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" \
    > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin \
    fuse-overlayfs \
    iptables \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /etc/docker \
  && printf '%s\n' '{' '  "storage-driver": "fuse-overlayfs"' '}' > /etc/docker/daemon.json \
  && update-alternatives --set iptables /usr/sbin/iptables-legacy \
  && update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy

# Non-root user with passwordless sudo (required by Cloud Agents)
RUN id -u ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu \
  && groupadd -f docker \
  && usermod -aG docker ubuntu \
  && usermod -aG sudo ubuntu \
  && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu

USER ubuntu
WORKDIR /home/ubuntu
