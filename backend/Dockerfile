# Simple multi-stage Dockerfile for the Node Express backend
# Place this at backend/Dockerfile

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --production

FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN rm -rf node_modules

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Use the runtime deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/schemas ./schemas
# Cloud Run expects the app to listen on the PORT env var
ENV PORT=8080
EXPOSE 8080
# Start the server using the same start script from package.json
CMD ["node", "src/server.js"]
