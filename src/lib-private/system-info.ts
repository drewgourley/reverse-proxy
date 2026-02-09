const got: any = require('got');
import os from 'os';

export async function getPublicIP(): Promise<string> {
  const response = await got('https://checkip.amazonaws.com/', { timeout: { request: 5000 } });
  return response.body.trim();
}

export function getLocalIP(): string {
  const networkInterfaces = os.networkInterfaces();
  let localIP: string | null = null;

  for (const interfaceName in networkInterfaces) {
    const interfaces = (networkInterfaces as any)[interfaceName];
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
