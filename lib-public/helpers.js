"use strict";

/**
 * WARNING: Functions in this module are utility helpers used throughout the application.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const fs = require('fs');
const path = require('path');

/**
 * Find the page that replaces an index service's own index.html at its root
 * @param {string} publicFolderPath - The service's folder under web/public
 * @returns {string|null} Path to homepage/index.html inside that folder, or null when there isn't one
 */
function findHomepage(publicFolderPath) {
  const file = path.join(publicFolderPath, 'homepage', 'index.html');
  return fs.existsSync(file) ? file : null;
}

/**
 * Send standardized error response
 * @param {object} response - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string|Error} error - Error message or Error object
 * @returns {void}
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

module.exports = {
  sendError,
  extractIpFromSocket,
  findHomepage
};
