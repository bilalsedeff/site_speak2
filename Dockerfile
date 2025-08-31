# SiteSpeak Dockerfile - Production Build
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force
RUN cd client && npm ci --only=production && npm cache clean --force
RUN cd server && npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules

# Copy source code
COPY . .

# Build client
WORKDIR /app/client
RUN npm run build

# Build server
WORKDIR /app/server
RUN npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/client/dist ./client/dist
COPY --from=builder --chown=nextjs:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=nextjs:nodejs /app/server/node_modules ./server/node_modules
 
COPY --from=builder --chown=nextjs:nodejs /app/published-sites ./published-sites

# Copy necessary config files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/drizzle.config.ts ./server/

# Create necessary directories
RUN mkdir -p temp/audio uploads/optimized uploads/thumbnails project_definitions server/knowledge-base
RUN chown -R nextjs:nodejs temp uploads project_definitions server/knowledge-base

# Copy database files if they exist
COPY --from=builder /app/project_definitions/ ./project_definitions/

USER nextjs

# Expose ports
EXPOSE 3000 5000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start the application
CMD ["node", "server/dist/index.js"]