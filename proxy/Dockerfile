FROM node:20-alpine AS deps
WORKDIR /app

# Context is already /proxy from Cloud Build, so these are at the root:
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app

# Bring in the full app source from the proxy/ context
COPY . .
# Just in case node_modules snuck into the context (e.g., from local dev)
RUN rm -rf ./node_modules || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Use dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy app artifacts from builder stage
COPY --from=builder /app/cloudrun-proxy.js ./cloudrun-proxy.js
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/openapi.json ./openapi.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public

ENV PORT=8080
EXPOSE 8080
CMD ["node", "cloudrun-proxy.js"]
