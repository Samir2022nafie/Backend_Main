# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies required for Prisma native engines on Alpine
RUN apk add --no-cache openssl

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies including devDependencies for build
RUN npm ci || npm install

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and configuration
COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

# Compile production bundle
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install openssl for Prisma engine runtime
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests and production dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev || npm install --omit=dev

# Copy generated Prisma Client and compiled application from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist

# Non-root user for security best practices
USER node

EXPOSE 3000

# Health check against the health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/src/main.js"]
