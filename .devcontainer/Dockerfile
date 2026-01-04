# Inbox Zero Development Container
#
# Extends Microsoft devcontainer with proper directory permissions for named volumes

FROM mcr.microsoft.com/devcontainers/javascript-node:22

# Install GitHub CLI
RUN (type -p wget >/dev/null || (apt-get update && apt-get install wget -y)) \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat $out | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm@10

# Create directories with correct ownership BEFORE volumes are mounted
# Docker preserves ownership when mounting empty named volumes to pre-existing directories
RUN mkdir -p /workspaces/inbox-zero/node_modules \
    && mkdir -p /pnpm/store \
    && chown -R node:node /workspaces \
    && chown -R node:node /pnpm

WORKDIR /workspaces/inbox-zero

# Switch to non-root user
USER node

# Configure pnpm store location
RUN pnpm config set store-dir /pnpm/store

CMD ["sleep", "infinity"]
