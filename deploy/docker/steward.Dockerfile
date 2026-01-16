# Squire Steward
# Task orchestrator that generates coding tasks from goals and signals

# ==============================================================================
# Stage 1: Dependencies
# ==============================================================================
FROM node:24-slim AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/steward/package.json ./packages/steward/

# Install dependencies
RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 2: Builder
# ==============================================================================
FROM node:24-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/steward/node_modules ./packages/steward/node_modules

# Copy source files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/core ./packages/core
COPY packages/steward ./packages/steward

# Build packages
RUN pnpm --filter @squire/core build && \
    pnpm --filter @squire/steward build

# ==============================================================================
# Stage 3: Runner
# ==============================================================================
FROM node:24-slim AS runner

WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home steward

# Set production environment
ENV NODE_ENV=production
ENV SQUIRE_BACKEND=kubernetes

# Copy built packages
COPY --from=builder --chown=steward:nodejs /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=steward:nodejs /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=steward:nodejs /app/packages/steward/dist ./packages/steward/dist
COPY --from=builder --chown=steward:nodejs /app/packages/steward/package.json ./packages/steward/
COPY --from=builder --chown=steward:nodejs /app/package.json ./

# Copy production dependencies only
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/steward/node_modules ./packages/steward/node_modules

# Create config and data directories (will be mounted as volumes in K8s)
RUN mkdir -p /config /data/tasks /data/signals && \
    chown -R steward:nodejs /config /data

# Switch to non-root user
USER steward

# Default command - watch mode with 30 second interval
CMD ["node", "packages/steward/dist/index.js", "watch", "--interval", "30"]
