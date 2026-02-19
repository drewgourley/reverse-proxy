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

module.exports = {
  sendError,
  extractIpFromSocket
};
