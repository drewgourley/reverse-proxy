#!/usr/bin/env node

// Lightweight wrapper for backwards compatibility: launch the compiled app in `dist`
try {
  require('./dist/app.js');
} catch (err) {
  console.error('Failed to start application from dist:', err);
  process.exit(1);
}

