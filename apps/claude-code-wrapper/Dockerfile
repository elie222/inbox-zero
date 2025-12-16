# Claude Code Wrapper Service
# Provides HTTP interface to Claude Code CLI for container-to-container communication

FROM node:20-slim

# Install required system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
# Note: This requires ANTHROPIC_API_KEY to be set at runtime
RUN npm install -g @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files (using npm for this standalone service)
COPY apps/claude-code-wrapper/package.json ./
COPY apps/claude-code-wrapper/package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY apps/claude-code-wrapper/tsconfig.json ./
COPY apps/claude-code-wrapper/src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies for smaller image
RUN npm prune --production

# Create directory for Claude CLI data persistence
RUN mkdir -p /root/.claude

# Expose the service port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# Start the service
CMD ["node", "dist/index.js"]
