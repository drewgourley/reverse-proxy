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

# copy app
COPY . .

# ensure directories exist for runtime volumes
RUN mkdir -p /usr/src/app/store /etc/letsencrypt

ENV NODE_ENV=production
ENV CONTAINERIZED=true

EXPOSE 8080 8443 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:8080/ || exit 1

CMD ["node", "app.js"]
