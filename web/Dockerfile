
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create a non-root user (optional but recommended, skipping for simplicity in file permission handling with volumes)
# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 nextjs

# Copy public folder (static assets)
COPY --from=builder /app/public ./public
# Ensure uploads directory exists and has correct permissions
RUN mkdir -p ./public/uploads && chmod 777 ./public/uploads

# Copy data folder for initialization (if it exists in repo)
# Important: Users should mount a volume to /app/data for persistence
# COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# Persist uploaded files
# Users should mount a volume to /app/public/uploads to persist images
VOLUME ["/app/public/uploads"]

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

# Switch to root to allow entrypoint to fix permissions
# The entrypoint can then downgrade to nextjs user if needed, 
# or we just run as root to avoid volume permission headaches in Dokploy
USER root

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget --spider -q http://localhost:3000 || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
