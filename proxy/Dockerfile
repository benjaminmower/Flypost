FROM node:20-alpine AS deps
WORKDIR /app
COPY proxy/package.json proxy/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY proxy ./proxy
RUN rm -rf ./proxy/node_modules || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/proxy/cloudrun-proxy.js ./cloudrun-proxy.js
COPY --from=builder /app/proxy/package.json ./package.json
COPY --from=builder /app/proxy/src ./src

ENV PORT=8080
EXPOSE 8080
CMD ["node", "cloudrun-proxy.js"]
