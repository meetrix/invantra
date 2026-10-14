# Build the frontend.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The server runs its TypeScript directly (Node strips the types), so the final
# image needs only the runtime dependencies, the server source and the built frontend.
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# npm is only needed for this install; removing it keeps its own bundled
# packages, and their security advisories, out of the image.
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
# Standard image labels. VERSION and REVISION are passed at build time:
#   docker build --build-arg VERSION=1.0.0 --build-arg REVISION=$(git rev-parse HEAD) .
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Invantra" \
      org.opencontainers.image.description="Self-hosted estimates and invoices" \
      org.opencontainers.image.vendor="Meetrix Pty Ltd" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION"
USER node
EXPOSE 8787
# Node's own fetch, so the image needs no curl or wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/src/index.ts"]
