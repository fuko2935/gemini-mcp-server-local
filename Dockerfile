FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the TypeScript
RUN npm run build

# Make the script executable
RUN chmod +x dist/server.js

# Set the entry point
ENTRYPOINT ["node", "dist/server.js"]