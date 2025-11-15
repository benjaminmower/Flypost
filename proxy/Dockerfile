# Stage 1: install production deps (cached when package*.json unchanged)
FROM node:20-alpine AS deps
WORKDIR /app
# copy both package.json and package-lock.json for reproducible installs
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Stage 2: copy source (no install here)
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
# ensure no stray node_modules are in the build context
RUN rm -rf node_modules || true

# Stage 3: runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# bring only production node_modules
COPY --from=deps /app/node_modules ./node_modules
# copy the app entrypoint and any other runtime files
COPY --from=builder /app/cloudrun-proxy.js ./cloudrun-proxy.js
COPY --from=builder /app/package.json ./package.json
# Include runtime sources that cloudrun-proxy.js requires
COPY --from=builder /app/src ./src

ENV PORT=8080
EXPOSE 8080
CMD ["node", "cloudrun-proxy.js"]
