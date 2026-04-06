FROM oven/bun:1.3.9

# Dependencies
# RUN apt-get update && apt-get install -y curl

# Protocol install
WORKDIR /app/protocol
COPY protocol/package.json .
RUN bun install --frozen-lockfile && rm -rf /root/.bun/install/cache
COPY protocol/src src
COPY protocol/tsconfig.json .
# RUN bun type-check

# Cdn install
WORKDIR /app/cdn
COPY cdn/package.json .
COPY cdn/bun.lock .
RUN bun install --frozen-lockfile && rm -rf /root/.bun/install/cache
COPY cdn/tsconfig.json .
COPY cdn/src src
COPY cdn/generated generated
# RUN bun type-check

# Api server install
WORKDIR /app/backend
COPY backend/package.json .
COPY backend/bun.lock .
RUN bun install --frozen-lockfile && rm -rf /root/.bun/install/cache
COPY backend/src src
COPY backend/tsconfig.json .
COPY backend/public public
# RUN bun type-check

# Run
ENV NODE_ENV=production
CMD ["bun", "src/index.ts"]
