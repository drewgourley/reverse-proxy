const fs = require('fs');
const path = require('path');

// ========== Bot Detection Patterns ==========
const suspiciousPatterns = [
  // Environment and config files
  { pattern: /\.env($|\.|\?)/i, score: 8, name: 'env-file' },
  { pattern: /\.env\.(backup|bak|save|local|production|development|example|sample)/i, score: 10, name: 'env-backup' },
  { pattern: /aws.*credentials|\.aws\/credentials/i, score: 10, name: 'aws-creds' },
  { pattern: /config\.(php|json|yml|yaml|inc)/i, score: 7, name: 'config-file' },
  { pattern: /configuration\.(php|bak)/i, score: 7, name: 'config-bak' },
  
  // PHP info and debug
  { pattern: /phpinfo|info\.php|php\.php/i, score: 8, name: 'phpinfo' },
  { pattern: /php(test|version|sysinfo)/i, score: 7, name: 'php-debug' },
  
  // WordPress
  { pattern: /wp-(admin|login|content|includes|atom\.php)/i, score: 9, name: 'wordpress' },
  { pattern: /wp-config|wp_filemanager/i, score: 10, name: 'wp-exploit' },
  
  // Database files
  { pattern: /\.(sql|dump|database)($|\?)/i, score: 9, name: 'database' },
  { pattern: /db\.(sql|backup|dump)/i, score: 9, name: 'db-backup' },
  
  // Backup and archive files
  { pattern: /backup\.(zip|tar\.gz|sql|bak)/i, score: 8, name: 'backup-files' },
  
  // Admin panels and managers
  { pattern: /phpmyadmin|adminer|dbadmin/i, score: 8, name: 'db-admin' },
  { pattern: /manager\/html|tomcat\/manager/i, score: 9, name: 'tomcat-mgr' },
  
  // Git exposure
  { pattern: /\.git\/(config|HEAD|index)/i, score: 10, name: 'git-exposure' },
  
  // Path traversal
  { pattern: /\.\.%2e|\.\.\/|\.\.\\|%2e%2e/i, score: 10, name: 'path-traversal' },
  { pattern: /\/bin\/(sh|bash)|\/sbin\/init/i, score: 10, name: 'shell-access' },
  
  // Common exploit paths
  { pattern: /cgi-bin\/.*\.(sh|pl|cgi)/i, score: 9, name: 'cgi-exploit' },
  { pattern: /\/shell|c99\.php|r57\.php|ak\.php/i, score: 10, name: 'webshell' },
  
  // Installation/setup files (shouldn't be public)
  { pattern: /install\.php|setup\.php|upgrade\.php/i, score: 7, name: 'install-files' },
  
  // Debug and test endpoints
  { pattern: /\/debug|\/test\.php|\/dev\/|phpunit/i, score: 6, name: 'debug-endpoints' },
  
  // Sensitive directories
  { pattern: /\/admin|\/administrator/i, score: 5, name: 'admin-path' },
  { pattern: /\/api\/(internal|private|admin|config)/i, score: 7, name: 'internal-api' }
];

const ipSuspicionScores = new Map(); // Track scores per IP
const BLOCK_THRESHOLD = 20; // Auto-block after this score
const SCORE_DECAY_MS = 3600000; // Reset scores after 1 hour

/**
 * Check if a request matches suspicious vulnerability scanning patterns
 * @param {string} ip - Client IP address
 * @param {string} url - Request URL
 * @returns {Object} Suspicion analysis with score and patterns
 */
function checkSuspiciousRequest(ip, url, host) {
  if (ip === 'unknown') return { suspicious: false, score: 0 };
  
  const hostStr = (host || '').toString();
  const ipv4Regex = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/;
  const ipv6Regex = /^\[?[0-9a-fA-F:]+\]?(?::\d+)?$/;
  const reverseDnsRegex = /(static|dynamic|dialup|customer|pool|dhcp|residential)\./i;

  let totalScore = 0;
  const matches = [];

  // Match URL-based suspicious patterns
  for (const { pattern, score, name } of suspiciousPatterns) {
    if (pattern.test(url)) {
      totalScore += score;
      matches.push(name);
    }
  }

  // Host-based scoring: IP literals and suspicious reverse DNS names
  const isHostIPv4 = hostStr && ipv4Regex.test(hostStr);
  const isHostIPv6 = hostStr && ipv6Regex.test(hostStr) && hostStr.includes(':');
  const isHostIP = Boolean(isHostIPv4 || isHostIPv6);
  if (isHostIP) {
    totalScore += 5; // treat direct IP host as more suspicious
    matches.push('host-ip');
  }
  if (hostStr && reverseDnsRegex.test(hostStr)) {
    totalScore += 2; // a little suspicious for ISP/residential hostnames
    matches.push('reverse-dns');
  }

  // Escalate if direct-IP host combines with high-severity indicators
  const highSeverity = new Set(['env-file','env-backup','aws-creds','phpinfo','git-exposure','path-traversal','webshell','database','db-backup','wp-exploit']);
  const matchedHigh = matches.some(m => highSeverity.has(m));
  if (isHostIP && matchedHigh) {
    totalScore += 10; // rapid escalation for direct-IP + sensitive probe
    matches.push('host-ip-escalation');
  }

  if (totalScore > 0) {
    // Update IP's cumulative score
    const now = Date.now();
    let ipData = ipSuspicionScores.get(ip) || { score: 0, lastSeen: now, requests: [] };

    // Reset score if enough time has passed
    if (now - ipData.lastSeen > SCORE_DECAY_MS) {
      ipData = { score: 0, lastSeen: now, requests: [] };
    }

    ipData.score += totalScore;
    ipData.lastSeen = now;
    ipData.requests.push({ url, host: hostStr, score: totalScore, patterns: matches, time: now });

    // Keep only last 50 requests to prevent memory bloat
    if (ipData.requests.length > 50) ipData.requests.shift();

    ipSuspicionScores.set(ip, ipData);

    return {
      suspicious: true,
      score: totalScore,
      cumulativeScore: ipData.score,
      patterns: matches,
      shouldBlock: ipData.score >= BLOCK_THRESHOLD || (isHostIP && matchedHigh)
    };
  }

  return { suspicious: false, score: 0 };
}

/**
 * Add an IP to the blocklist and persist to disk
 * @param {string} ip - IP address to block
 * @param {string} reason - Reason for blocking
 * @param {Array} blocklist - Current blocklist array
 * @returns {Promise<Array>} Updated blocklist
 */
async function addToBlocklist(ip, reason, blocklist) {
  if (!blocklist) blocklist = [];
  if (!blocklist.includes(ip)) {
    blocklist.push(ip);
    
    // Persist to blocklist.json
    try {
      const blocklistPath = path.join(__dirname, '..', 'blocklist.json');
      fs.writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
      const now = new Date().toISOString();
      console.log(`${now}: [auto-block] Added ${ip} to blocklist - ${reason}`);
    } catch (error) {
      const now = new Date().toISOString();
      console.error(`${now}: Failed to persist blocklist:`, error.message);
    }
  }
  return blocklist;
}

module.exports = {
  checkSuspiciousRequest,
  addToBlocklist,
  BLOCK_THRESHOLD,
  SCORE_DECAY_MS
};
