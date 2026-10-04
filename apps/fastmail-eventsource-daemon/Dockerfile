FROM node:24-alpine AS build
WORKDIR /app
ENV pnpm_config_verify_deps_before_run=false
RUN npm install -g pnpm@11.19.0
COPY . .
RUN pnpm --filter inbox-zero-fastmail-eventsource-daemon install --frozen-lockfile --ignore-scripts --config.enableGlobalVirtualStore=false
RUN pnpm --filter inbox-zero-fastmail-eventsource-daemon build
RUN pnpm --filter inbox-zero-fastmail-eventsource-daemon deploy --legacy --prod --config.enableGlobalVirtualStore=false /daemon

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /daemon .
COPY --from=build --chown=node:node /app/apps/fastmail-eventsource-daemon/dist ./dist
USER node
CMD ["node", "dist/index.js"]
