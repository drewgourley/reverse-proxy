#!/bin/sh
set -e

# If arguments were provided, run them (allows `docker run image <cmd>` overrides)
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# Default behavior: use pm2-runtime only if an ecosystem file exists; otherwise run node directly
if [ -f /usr/src/app/ecosystem.config.js ]; then
  echo "[entrypoint] ecosystem.config.js found — starting with pm2-runtime"
  exec pm2-runtime ecosystem.config.js --env "${NODE_ENV:-production}"
else
  echo "[entrypoint] no ecosystem.config.js — starting with node app.js"
  exec node app.js
fi
