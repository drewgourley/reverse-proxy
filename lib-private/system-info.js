"use strict";

const got = require('got');
const os = require('os');

/**
 * Get public IP address
 * @returns {Promise<string>} Public IP address
 */
async function getPublicIP() {
  const response = await got('https://checkip.amazonaws.com/', { timeout: { request: 5000 } });
  return response.body.trim();
}

/**
 * Get local IP address
 * @returns {string} Local IP address
 */
function getLocalIP() {
  const networkInterfaces = os.networkInterfaces();
  let localIP = null;
  
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP) break;
  }
  
  return localIP || '127.0.0.1';
}

module.exports = {
  getPublicIP,
  getLocalIP
};
