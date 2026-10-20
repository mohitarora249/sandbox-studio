# Application/control-plane image. The separate sandbox runtime images are built from Dockerfile.sandbox.
FROM node:22-bookworm-slim AS deps
# Prisma needs OpenSSL/libssl to select the correct native engine target.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma Client generation reads the schema but does not connect to a database at build time.
# This placeholder is overridden by DATABASE_URL at runtime.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# A non-root user reduces the app's own process privileges. Docker socket access remains highly privileged.
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
COPY --from=builder --chown=app:app /app .
USER app
EXPOSE 3000
CMD ["sh", "-lc", "npx prisma migrate deploy && npm run start"]
