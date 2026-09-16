FROM node:24-bookworm-slim
WORKDIR /workspace
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm hashes every patch named in the workspace file, even for packages this
# filtered install never resolves.
COPY patches patches
COPY apps/unsubscribe-worker/package.json apps/unsubscribe-worker/package.json
RUN pnpm install --filter @inboxzero/unsubscribe-worker --frozen-lockfile --ignore-scripts --config.enable-global-virtual-store=false
# Not `pnpm exec`: its dependency check treats the filtered --ignore-scripts
# install above as stale and aborts trying to purge node_modules without a TTY.
RUN apps/unsubscribe-worker/node_modules/.bin/playwright install --with-deps chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
RUN mv /root/.cache/ms-playwright /opt/browsers && chmod -R a+rX /opt/browsers
COPY apps/unsubscribe-worker/src /workspace/apps/unsubscribe-worker/src
RUN ln -s /workspace/apps/unsubscribe-worker /app
USER 1000:1000
CMD ["node", "/app/src/runner.ts"]
