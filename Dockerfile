# Production image for Estate Manager reverse-proxy
FROM node:20-bullseye-slim

# Install certbot + cron + curl for healthcheck
RUN apt-get update \
  && apt-get install -y --no-install-recommends certbot cron curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# install production deps first (cache layer)
COPY package.json ./
RUN npm install --production --no-audit --no-fund

# install PM2 (container-friendly process manager) and pm2-logrotate module
RUN npm install -g pm2@latest \
  && pm2 -v || true \
  && pm2 install pm2-logrotate || true \
  && pm2 set pm2-logrotate:max_size 10M || true

# copy app
COPY . .

# ensure directories exist for runtime volumes and make entrypoint executable
RUN mkdir -p /usr/src/app/store /etc/letsencrypt \
  && chmod +x /usr/src/app/docker-entrypoint.sh || true

ENV NODE_ENV=production
ENV CONTAINERIZED=true

EXPOSE 8080 8443 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:8080/ || exit 1

ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]
