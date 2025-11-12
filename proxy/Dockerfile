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
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/cloudrun-proxy.js ./cloudrun-proxy.js
COPY --from=builder /app/package.json ./package.json
ENV PORT=8080
EXPOSE 8080
CMD ["node", "cloudrun-proxy.js"]
