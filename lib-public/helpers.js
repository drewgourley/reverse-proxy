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

module.exports = {
  sendError,
  handleWebSocketUpgrade
};
