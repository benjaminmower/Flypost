# Stage 1: Build stage – Build the widget
FROM node:20-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package. json and package-lock.json to the container
COPY package.json package-lock.json ./
RUN npm install --only=production

# Copy the rest of the widget's source files into the container
COPY .  ./

# Build the embeddable HTML widget
RUN node build.js

# Stage 2: Run stage – Serve the widget
FROM node:20-alpine

# Install http-server globally (as root, before switching users)
RUN npm install -g http-server

# Create a non-root user for running the application
RUN addgroup appgroup && adduser -S appuser -G appgroup

# Set the working directory for serving files
WORKDIR /srv

# Copy the generated embeddable.html as index.html from the build stage
COPY --from=builder /app/embeddable.html ./index.html

# Change ownership of /srv to appuser
RUN chown -R appuser:appgroup /srv

# Switch to non-root user
USER appuser

# Expose port 8080 for Cloud Run
EXPOSE 8080

# Start the HTTP server, serving /srv directory
CMD ["http-server", "/srv", "-p", "8080", "-a", "0.0.0.0", "-d", "false"]
