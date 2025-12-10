# Stage 1: Build stage – Build the widget
FROM node:20-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package.json package-lock.json ./
RUN npm install --only=production

# Copy the rest of the widget's source files into the container
COPY . ./

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

# Install http-server to a user-accessible directory without using -g
RUN npm install http-server

# Expose port 8080 for Cloud Run
EXPOSE 8080

# Add a healthcheck endpoint for Cloud Run
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080 || exit 1

# Start the HTTP server using npx
CMD ["npx", "http-server", "-p", "8080", "-a", "0.0.0.0", "--index", "embeddable.html"]
