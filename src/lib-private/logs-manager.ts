import fs from 'fs';
import os from 'os';
import path from 'path';

export function streamLogs(request: any, response: any) {
  const appName = request.params.appName;
  const type = request.params.type || 'out';

  const setSSEHeaders = (res: any) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();
  };

  const sendLogLines = (res: any, data: string) => {
    const lines = data.split(/\r?\n/);
    for (const line of lines) {
      if (line) res.write(`data: ${line}\n\n`);
    }
  };

  setSSEHeaders(response);

  const logPath = path.join(
    os.homedir(),
    '.pm2',
    'logs',
    `${appName.replace(' ', '-')}-${type}.log`,
  );

  if (!fs.existsSync(logPath)) {
    response.write(`data: Log file not found\n\n`);
    response.end();
    return;
  }

  const keepAliveInterval = setInterval(() => {
    response.write(': keep-alive\n\n');
  }, 30000);

  let fileSize = fs.statSync(logPath).size;
  let fileDescriptor = fs.openSync(logPath, 'r');
  let isClosed = false;

  try {
    const fileContent = fs.readFileSync(logPath, 'utf8');
    const lines = fileContent.split(/\r?\n/).filter((line) => line.trim());
    const last100Lines = lines.slice(-100).join('\n');
    if (last100Lines) {
      sendLogLines(response, last100Lines);
    }
  } catch (err) {
    response.write(`data: Error reading log file\n\n`);
  }

  const watcher = fs.watch(logPath, (eventType) => {
    if (eventType === 'change') {
      try {
        const stats = fs.statSync(logPath);
        if (stats.size > fileSize) {
          const readLen = stats.size - fileSize;
          const readBuffer = Buffer.alloc(readLen);
          fs.readSync(fileDescriptor, readBuffer, 0, readLen, fileSize);
          fileSize = stats.size;
          sendLogLines(response, readBuffer.toString('utf8'));
        }
      } catch (err) {
        // file may be rotated, ignore
      }
    }
  });

  request.on('close', () => {
    if (isClosed) return;
    isClosed = true;
    clearInterval(keepAliveInterval);
    watcher.close();
    fs.closeSync(fileDescriptor);
  });
}
