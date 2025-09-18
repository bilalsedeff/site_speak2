# SiteSpeak Dockerfile - 12-Factor Production Build

# Base stage with common dependencies
FROM node:20-alpine AS base
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    chromium \
    chromium-chromedriver
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build client
RUN npm run build:client

# Build server components (web and worker)
RUN npm run build:web
RUN npm run build:worker

# Web Process Stage (12-Factor Compliant)
FROM base AS web
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 sitespeak

# Copy only web process dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder --chown=sitespeak:nodejs /app/dist/web.js ./server/web.js
COPY --from=builder --chown=sitespeak:nodejs /app/client/dist ./client/dist

# Copy shared assets needed by web process
COPY --from=builder --chown=sitespeak:nodejs /app/shared ./shared
COPY --from=builder --chown=sitespeak:nodejs /app/server/src/shared ./server/src/shared

# Create directories for web process
RUN mkdir -p uploads temp && chown -R sitespeak:nodejs uploads temp

# Set environment for web process
ENV NODE_ENV=production
ENV PROCESS_TYPE=web
ENV PORT=5000

# Health check for web process
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/health/ready || exit 1

USER sitespeak
EXPOSE 5000

CMD ["node", "server/web.js"]

# Worker Process Stage (12-Factor Compliant)
FROM base AS worker
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 sitespeak

# Copy worker process dependencies and Playwright for crawling
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder --chown=sitespeak:nodejs /app/dist/worker.js ./server/worker.js

# Copy shared assets needed by worker process
COPY --from=builder --chown=sitespeak:nodejs /app/shared ./shared
COPY --from=builder --chown=sitespeak:nodejs /app/server/src/shared ./server/src/shared

# Create directories for worker process
RUN mkdir -p uploads temp knowledge-base published-sites project_definitions
RUN chown -R sitespeak:nodejs uploads temp knowledge-base published-sites project_definitions

# Set environment for worker process
ENV NODE_ENV=production
ENV PROCESS_TYPE=worker

# Health check for worker process
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

USER sitespeak

CMD ["node", "server/worker.js"]

# Legacy Single Process Stage (for backward compatibility)
FROM base AS legacy
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 sitespeak

# Copy built application (legacy single process)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder --chown=sitespeak:nodejs /app/client/dist ./client/dist
COPY --from=builder --chown=sitespeak:nodejs /app/dist/index.js ./server/index.js
COPY --from=builder --chown=sitespeak:nodejs /app/shared ./shared
COPY --from=builder --chown=sitespeak:nodejs /app/server/src/shared ./server/src/shared

# Create application directories
RUN mkdir -p uploads published-sites temp knowledge-base project_definitions
RUN chown -R sitespeak:nodejs uploads published-sites temp knowledge-base project_definitions

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

USER sitespeak
EXPOSE 5000

CMD ["node", "server/index.js"]