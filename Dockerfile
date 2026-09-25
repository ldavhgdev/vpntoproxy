FROM ubuntu:22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    curl \
    wget \
    wireguard \
    wireguard-tools \
    openvpn \
    iproute2 \
    iptables \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application files
COPY src ./src
COPY public ./public
COPY .env.example ./

# Create non-root user
RUN useradd -m -s /bin/bash vpnproxy && \
    chown -R vpnproxy:vpnproxy /app

# Create required directories
RUN mkdir -p /var/log/vpn-to-proxy /var/lib/vpn-to-proxy /etc/vpn-to-proxy && \
    chown -R vpnproxy:vpnproxy /var/log/vpn-to-proxy /var/lib/vpn-to-proxy /etc/vpn-to-proxy

USER vpnproxy

# Expose ports
EXPOSE 3000 1080 8888

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "src/index.js"]
