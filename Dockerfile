FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p data public

# Expose port
EXPOSE 3001

# Start the server
CMD ["node", "server.js"] 