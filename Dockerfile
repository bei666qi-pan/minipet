FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.server.json ./
COPY apps/backend ./apps/backend
COPY apps/admin ./apps/admin
COPY apps/website ./apps/website
COPY design ./design
RUN pnpm run build:server

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/apps/admin ./apps/admin
COPY --from=build /app/apps/website ./apps/website
COPY --from=build /app/design ./design
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
