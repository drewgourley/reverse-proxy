"use strict";

/**
 * WARNING: Functions in this module are utility helpers used throughout the application.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

/**
 * Send standardized error response
 * @param {object} response - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string|Error} error - Error message or Error object
 */
function sendError(response, statusCode, error) {
  response.status(statusCode).send({ 
    success: false, 
    error: typeof error === 'string' ? error : error.message,
    ...(error.details && { details: error.details })
  });
}

/**
 * Get the client's IP address from a socket object
 * @param {Socket} socket - The socket object from which to extract the IP address 
 * @returns {string} The extracted IP address or 'unknown' if not available
 */
function extractIpFromSocket(socket) {
  let addr = socket?.remoteAddress;
  if (!addr) return 'unknown';
  addr = String(addr).trim();

  // IPv4-mapped IPv6 -> normalise to IPv4
  if (addr.startsWith('::ffff:')) return addr.split('::ffff:')[1];

  // strip IPv6 zone id (fe80::1%eth0)
  const zoneIdx = addr.indexOf('%');
  if (zoneIdx !== -1) addr = addr.slice(0, zoneIdx);

  // If it looks like IPv6 (contains ':'), return as-is (preserve scope/format)
  if (addr.includes(':')) return addr;

  // Fallback: return last colon-separated segment (covers odd platform formats)
  const parts = addr.split(':');
  return parts[parts.length - 1];
};

/**
 * Handle WebSocket upgrade requests for proxied services
 * @param {object} config - Configuration object
 * @param {function} req - Request object
 * @param {function} socket - Socket object
 * @param {function} head - Head buffer
 */
function handleWebSocketUpgrade(config, req, socket, head) {
  const websockets = Object.keys(config.services).filter(name => config.services[name].subdomain?.proxy?.socket);
  let found = false;
  websockets.forEach(name => {
    if (req.headers.host === `${name}.${config.domain}`) {
      config.services[name].subdomain.proxy.websocket.upgrade(req, socket, head);
      found = true;
    }
  });
  if (!found) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
}

/**
 * Set up server listener
 * @param {object} config - Configuration object
 * @param {Array<string>} blocklist - List of blocked IP addresses
 * @param {object} server - HTTP or HTTPS server instance
 * @param {number} port - Port number to listen on
 * @param {string} type - Server type (e.g., 'HTTP' or 'HTTPS') for logging
 */
function setupServerListener(config, blocklist, server, port, type) {
  server.listen(port, () => {
    const now = new Date().toISOString();
    console.log(`${now}: ${type} Server running on port ${port}`);
    server.on('upgrade', (req, socket, head) => {
      const ip = extractIpFromSocket(socket);
      if (isIpBlocked(ip, blocklist)) {
        console.log(`${now}: [early-block-upgrade] Destroying websocket connection from ${ip}`);
        try { socket.destroy(); } catch (e) { /* ignore */ }
        return;
      }
      handleWebSocketUpgrade(config, req, socket, head);
    });
  });
}

module.exports = {
  sendError,
  extractIpFromSocket,
  setupServerListener
};
