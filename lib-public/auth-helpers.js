"use strict";

/**
 * WARNING: Functions in this module handle user authentication and authorization.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const bcrypt = require('bcrypt');

/**
 * Check if user has access to a specific service
 * @param {string} username - Username to check
 * @param {string} serviceName - Service name to check access for
 * @param {object} secrets - Secrets configuration
 * @param {object} users - Users configuration
 * @returns {boolean} True if user has access
 */
function userHasServiceAccess(username, serviceName, secrets, users) {
  if (username === secrets.admin_email_address) return true;
  
  if (serviceName !== 'api') {
    const user = users.users?.find(u => u.username === username);
    if (!user) return false;
    if (user.services?.includes('*')) return true;
    return user.services?.includes(serviceName) || false;
  } else {
    return false;
  }
}

/**
 * Validate user credentials
 * @param {string} username - Username to validate
 * @param {string} password - Password to validate
 * @param {string} serviceName - Service name for access check
 * @param {object} secrets - Secrets configuration
 * @param {object} users - Users configuration
 * @returns {object} Validation result with valid flag and optional error
 */
async function validateUserCredentials(username, password, serviceName, secrets, users) {
  if (username === secrets.admin_email_address && secrets.api_password_hash) {
    const valid = await bcrypt.compare(password, secrets.api_password_hash);
    if (valid) return { valid: true, username };
  }

  const user = users.users?.find(u => u.username === username);
  if (user && user.password_hash) {
    const valid = await bcrypt.compare(password, user.password_hash);
    if (valid && userHasServiceAccess(username, serviceName, secrets, users)) {
      return { valid: true, username };
    }
    if (valid) {
      return { valid: false, error: 'Access denied to this service' };
    }
  }

  return { valid: false, error: 'Invalid credentials' };
}

module.exports = {
  userHasServiceAccess,
  validateUserCredentials
};
