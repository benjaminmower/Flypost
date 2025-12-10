# Stage 1: Build stage – Build the widget
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json, then install dependencies
COPY concierge/widget/package.json concierge/widget/package-lock.json ./
RUN npm install --only=production

# Copy the source files into the container
COPY concierge/widget/ ./

# Build the embeddable HTML widget
RUN node build.js

# Stage 2: Run stage – Serve the widget
FROM node:20-alpine

# Create a non-root user for running the application
RUN addgroup appgroup && adduser -S appuser -G appgroup
USER appuser

# Set the working directory for serving files
WORKDIR /app

# Copy the generated embeddable.html from the build stage
COPY --from=builder /app/embeddable.html .

# Install a lightweight HTTP server globally
RUN npm install -g http-server

# Expose port 8080 for Cloud Run
EXPOSE 8080

# Add a healthcheck endpoint for Cloud Run
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080 || exit 1

# Start the HTTP server to serve embeddable.html
CMD ["http-server", "-p", "8080"]
