# --- build stage ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Build tools for better-sqlite3's native addon (falls back to source if no prebuilt).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run gen-icons && npm run build
# Keep only production deps (better-sqlite3 stays, compiled against node 20).
RUN npm prune --omit=dev

# --- runtime stage ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# SQLite lives on a mounted volume so it survives container rebuilds.
ENV KASSA_DB=/data/kassa.sqlite

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
USER node

EXPOSE 3000
CMD ["node", "dist/server/index.js"]
