# Stage 1: install production deps (cached when package*.json unchanged)
FROM node:20-alpine AS deps
WORKDIR /app
# When build context is repo root, proxy's package files live under ./proxy
COPY proxy/package.json proxy/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Stage 2: copy proxy source
FROM node:20-alpine AS builder
WORKDIR /app
# Copy only proxy subdir into /app/proxy
COPY proxy ./proxy
RUN rm -rf ./proxy/node_modules || true

# Stage 3: runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# bring only production node_modules
COPY --from=deps /app/node_modules ./node_modules

# copy app entrypoint and runtime files from proxy subdir
COPY --from=builder /app/proxy/cloudrun-proxy.js ./cloudrun-proxy.js
COPY --from=builder /app/proxy/package.json ./package.json
COPY --from=builder /app/proxy/src ./src

ENV PORT=8080
EXPOSE 8080
CMD ["node", "cloudrun-proxy.js"]
