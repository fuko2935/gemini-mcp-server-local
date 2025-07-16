FROM node:22-alpine

WORKDIR /app

# Install git for potential dependencies
RUN apk add --no-cache git

# Copy package files
COPY package*.json tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install

# Copy source code
COPY src/ ./src/

# Build the TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Make the script executable
RUN chmod +x dist/server.js

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Set the entry point
ENTRYPOINT ["node", "dist/server.js"]