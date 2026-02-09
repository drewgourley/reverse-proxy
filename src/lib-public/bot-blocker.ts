import fs from 'fs';
import path from 'path';

const suspiciousPatterns = [
  { pattern: /\.env($|\.|\?)/i, score: 8, name: 'env-file' },
  {
    pattern: /\.env\.(backup|bak|save|local|production|development|example|sample)/i,
    score: 10,
    name: 'env-backup',
  },
  { pattern: /aws.*credentials|\.aws\/credentials/i, score: 10, name: 'aws-creds' },
  { pattern: /config\.(php|json|yml|yaml|inc)/i, score: 7, name: 'config-file' },
  { pattern: /configuration\.(php|bak)/i, score: 7, name: 'config-bak' },
  { pattern: /phpinfo|info\.php|php\.php/i, score: 8, name: 'phpinfo' },
  { pattern: /php(test|version|sysinfo)/i, score: 7, name: 'php-debug' },
  { pattern: /wp-(admin|login|content|includes|atom\.php)/i, score: 9, name: 'wordpress' },
  { pattern: /wp-config|wp_filemanager/i, score: 10, name: 'wp-exploit' },
  { pattern: /\.(sql|dump|database)($|\?)/i, score: 9, name: 'database' },
  { pattern: /db\.(sql|backup|dump)/i, score: 9, name: 'db-backup' },
  { pattern: /backup\.(zip|tar\.gz|sql|bak)/i, score: 8, name: 'backup-files' },
  { pattern: /phpmyadmin|adminer|dbadmin/i, score: 8, name: 'db-admin' },
  { pattern: /manager\/html|tomcat\/manager/i, score: 9, name: 'tomcat-mgr' },
  { pattern: /\.git\/(config|HEAD|index)/i, score: 10, name: 'git-exposure' },
  { pattern: /\.{2}%2e|\.\.\/|\.\.\\|%2e%2e/i, score: 10, name: 'path-traversal' },
  { pattern: /\/bin\/(sh|bash)|\/sbin\/init/i, score: 10, name: 'shell-access' },
  { pattern: /cgi-bin\/.*\.(sh|pl|cgi)/i, score: 9, name: 'cgi-exploit' },
  { pattern: /\/shell|c99\.php|r57\.php|ak\.php/i, score: 10, name: 'webshell' },
  { pattern: /install\.php|setup\.php|upgrade\.php/i, score: 7, name: 'install-files' },
  { pattern: /\/debug|\/test\.php|\/dev\/|phpunit/i, score: 6, name: 'debug-endpoints' },
  { pattern: /\/admin|\/administrator/i, score: 5, name: 'admin-path' },
  { pattern: /\/api\/(internal|private|admin|config)/i, score: 7, name: 'internal-api' },
];

const ipSuspicionScores: Map<string, any> = new Map();
export const BLOCK_THRESHOLD = 20;
export const SCORE_DECAY_MS = 3600000; // 1 hour

export function checkSuspiciousRequest(ip: string, url: string, host?: string) {
  if (ip === 'unknown') return { suspicious: false, score: 0 };

  const hostStr = (host || '').toString();
  const ipv4Regex = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/;
  const ipv6Regex = /^\[?[0-9a-fA-F:]+\]?(?::\d+)?$/;
  const reverseDnsRegex = /(static|dynamic|dialup|customer|pool|dhcp|residential)\./i;

  let totalScore = 0;
  const matches: string[] = [];

  for (const { pattern, score, name } of suspiciousPatterns) {
    if (pattern.test(url)) {
      totalScore += score;
      matches.push(name);
    }
  }

  const isHostIPv4 = hostStr && ipv4Regex.test(hostStr);
  const isHostIPv6 = hostStr && ipv6Regex.test(hostStr) && hostStr.includes(':');
  const isHostIP = Boolean(isHostIPv4 || isHostIPv6);
  if (isHostIP) {
    totalScore += 5;
    matches.push('host-ip');
  }
  if (hostStr && reverseDnsRegex.test(hostStr)) {
    totalScore += 2;
    matches.push('reverse-dns');
  }

  const highSeverity = new Set([
    'env-file',
    'env-backup',
    'aws-creds',
    'phpinfo',
    'git-exposure',
    'path-traversal',
    'webshell',
    'database',
    'db-backup',
    'wp-exploit',
  ]);
  const matchedHigh = matches.some((m) => highSeverity.has(m));
  if (isHostIP && matchedHigh) {
    totalScore += 10;
    matches.push('host-ip-escalation');
  }

  if (totalScore > 0) {
    const now = Date.now();
    let ipData = ipSuspicionScores.get(ip) || { score: 0, lastSeen: now, requests: [] };

    if (now - ipData.lastSeen > SCORE_DECAY_MS) {
      ipData = { score: 0, lastSeen: now, requests: [] };
    }

    ipData.score += totalScore;
    ipData.lastSeen = now;
    ipData.requests.push({ url, host: hostStr, score: totalScore, patterns: matches, time: now });

    if (ipData.requests.length > 50) ipData.requests.shift();

    ipSuspicionScores.set(ip, ipData);

    return {
      suspicious: true,
      score: totalScore,
      cumulativeScore: ipData.score,
      patterns: matches,
      shouldBlock: ipData.score >= BLOCK_THRESHOLD || (isHostIP && matchedHigh),
    };
  }

  return { suspicious: false, score: 0 };
}

export async function addToBlocklist(ip: string, reason: string, blocklist: string[] | null) {
  let list = blocklist || [];
  if (!list.includes(ip)) {
    list.push(ip);

    try {
      const blocklistPath = path.join(__dirname, '..', 'blocklist.json');
      fs.writeFileSync(blocklistPath, JSON.stringify(list, null, 2));
      const now = new Date().toISOString();
      console.log(`${now}: [auto-block] Added ${ip} to blocklist - ${reason}`);
    } catch (error: any) {
      const now = new Date().toISOString();
      console.error(`${now}: Failed to persist blocklist:`, error.message);
    }
  }
  return list;
}
