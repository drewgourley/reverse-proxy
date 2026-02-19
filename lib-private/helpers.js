"use strict";

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

module.exports = {
  sendError
};
