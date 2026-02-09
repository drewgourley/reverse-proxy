import dgram from 'dgram';

export const TAG_ID = 0xad0;
export const PROTOCOL_VERSION = 9;

export function VERSIONMAJOR(V: number) {
  return Math.floor(V / 256);
}
export function VERSIONMINOR(V: number) {
  return Math.floor((V % 256) / 10);
}
export function VERSIONPATCH(V: number) {
  return Math.floor((V % 256) % 10);
}
export function VERSION() {
  return Math.floor(0 * 256 + PROTOCOL_VERSION * 10);
}

export const OdalPapi = {
  MASTER_CHALLENGE: 777123,
  MASTER_RESPONSE: 777123,
  SERVER_CHALLENGE: 0xad011002,
  SERVER_VERSION_CHALLENGE: 0xad011001,
  PING_CHALLENGE: 1,
  CvarType: {
    CVARTYPE_NONE: 0,
    CVARTYPE_BOOL: 1,
    CVARTYPE_BYTE: 2,
    CVARTYPE_WORD: 3,
    CVARTYPE_INT: 4,
    CVARTYPE_FLOAT: 5,
    CVARTYPE_STRING: 6,
    CVARTYPE_MAX: 255,
  },
  GameType: {
    GT_Cooperative: 0,
    GT_Deathmatch: 1,
    GT_TeamDeathmatch: 2,
    GT_CaptureTheFlag: 3,
    GT_Max: 4,
  },
};

export class OdalPapiProcessError extends Error {
  removeServer: boolean;
  constructor(message: string, removeServer = false) {
    super(message);
    this.removeServer = removeServer;
  }
}

export type ServerIdentity = { ip: string; port: number };

export class OdalPapiMainService {
  currentIndex: number;

  constructor() {
    this.currentIndex = 0;
  }

  queryMasterServer(ip: string): Promise<Array<ServerIdentity>> {
    return new Promise((resolve, reject) => {
      const timeout = 10000;
      const socket = dgram.createSocket('udp4');
      const cb = Buffer.alloc(4);
      let timeoutId: NodeJS.Timeout | null = null;
      let isResolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        try {
          socket.close();
        } catch (err) {
          /* ignore */
        }
      };

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error('Master server query timed out'));
        }
      }, timeout);

      cb.writeUInt32LE(OdalPapi.MASTER_CHALLENGE, 0);

      socket.on('message', (response: Buffer) => {
        if (!isResolved) {
          isResolved = true;
          try {
            const baseList = this.processMasterResponse(response);
            cleanup();
            resolve(baseList);
          } catch (err) {
            cleanup();
            reject(err);
          }
        }
      });

      socket.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          console.error('Master server error:', err);
          cleanup();
          reject(err);
        }
      });

      socket.send(cb, 15000, ip, (err) => {
        if (err && !isResolved) {
          isResolved = true;
          cleanup();
          reject(err);
        }
      });
    });
  }

  queryGameServer(serverIdentity: ServerIdentity): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = 10000;
      const socket = dgram.createSocket('udp4');
      const cb = Buffer.alloc(4);
      const pingStart = Date.now();
      let timeoutId: NodeJS.Timeout | null = null;
      let isResolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        try {
          socket.close();
        } catch (err) {
          /* ignore */
        }
      };

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(
            new Error(
              `Query timeout for ${serverIdentity.ip}:${serverIdentity.port} after ${timeout}ms`,
            ),
          );
        }
      }, timeout);

      cb.writeUInt32LE(OdalPapi.SERVER_CHALLENGE, 0);

      socket.on('message', (response: Buffer) => {
        if (!isResolved) {
          isResolved = true;
          try {
            const pingResponse = Math.ceil((Date.now() - pingStart) / 2);
            const server = this.processGameServerResponse(response, serverIdentity);

            if ((server as any).responded) {
              cleanup();
              resolve({ server, pong: pingResponse });
            } else {
              cleanup();
              reject(
                new Error(`Invalid response from ${serverIdentity.ip}:${serverIdentity.port}`),
              );
            }
          } catch (err) {
            cleanup();
            reject(err);
          }
        }
      });

      socket.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          console.error(`Server query error for ${serverIdentity.ip}:${serverIdentity.port}:`, err);
          cleanup();
          reject(
            new Error(
              `Query error for ${serverIdentity.ip}:${serverIdentity.port}: ${err.message}`,
            ),
          );
        }
      });

      socket.send(cb, serverIdentity.port, serverIdentity.ip, (err) => {
        if (err && !isResolved) {
          isResolved = true;
          cleanup();
          reject(
            new Error(
              `Failed to send query to ${serverIdentity.ip}:${serverIdentity.port}: ${err.message}`,
            ),
          );
        }
      });
    });
  }

  pingGameServer(serverIdentity: ServerIdentity): Promise<number> {
    return new Promise((resolve, reject) => {
      const pingStart = Date.now();
      const pingBuf = Buffer.alloc(4);
      pingBuf.writeUInt32LE(OdalPapi.PING_CHALLENGE, 0);

      const socket = dgram.createSocket('udp4');
      let timeoutId: NodeJS.Timeout | null = null;
      let isResolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        try {
          socket.close();
        } catch (err) {
          /* ignore */
        }
      };

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error(`Ping timeout for ${serverIdentity.ip}:${serverIdentity.port}`));
        }
      }, 5000);

      socket.on('message', () => {
        if (!isResolved) {
          isResolved = true;
          const pingResponse = Date.now() - pingStart;
          cleanup();
          resolve(pingResponse);
        }
      });

      socket.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(
            new Error(`Ping error for ${serverIdentity.ip}:${serverIdentity.port}: ${err.message}`),
          );
        }
      });

      socket.send(pingBuf, serverIdentity.port, serverIdentity.ip, (err) => {
        if (err && !isResolved) {
          isResolved = true;
          cleanup();
          reject(
            new Error(
              `Failed to send ping to ${serverIdentity.ip}:${serverIdentity.port}: ${err.message}`,
            ),
          );
        }
      });
    });
  }

  processGameServerResponse(response: Buffer, serverAddr: ServerIdentity): any {
    const server: any = {
      address: serverAddr,
      patches: [],
      cvars: [],
      teams: [],
      wads: [],
      players: [],
      name: null,
      passwordHash: null,
      currentMap: null,
      versionRevStr: null,
      gameType: 0,
      response: null,
      versionRevision: null,
      versionProtocol: null,
      versionRealProtocol: null,
      pTime: null,
      scoreLimit: null,
      timeLimit: null,
      timeLeft: null,
      versionMajor: null,
      versionMinor: null,
      versionPatch: null,
      maxClients: null,
      maxPlayers: null,
      lives: null,
      sides: null,
      responded: false,
      ping: 0,
    };

    try {
      this.currentIndex = 0;

      const r = this.read32(response);
      const tagId = (r >> 20) & 0x0fff;
      const tagApplication = (r >> 16) & 0x0f;
      const tagQRId = (r >> 12) & 0x0f;
      const tagPacketType = r & 0xffff0fff;

      if (
        tagId !== TAG_ID ||
        !this.translateResponse(tagId, tagApplication, tagQRId, tagPacketType)
      ) {
        throw new OdalPapiProcessError(`Invalid response from ${serverAddr.ip}:${serverAddr.port}`);
      }

      const SvVersion = this.read32(response);
      const SvProtocolVersion = this.read32(response);

      if (SvVersion === 0) {
        throw new OdalPapiProcessError('Version issue');
      }

      server.versionMajor = VERSIONMAJOR(SvVersion);
      server.versionMinor = VERSIONMINOR(SvVersion);
      server.versionPatch = VERSIONPATCH(SvVersion);
      server.versionProtocol = SvProtocolVersion;

      if (
        VERSIONMAJOR(SvVersion) < VERSIONMAJOR(VERSION()) ||
        (VERSIONMAJOR(SvVersion) <= VERSIONMAJOR(VERSION()) &&
          VERSIONMINOR(SvVersion) < VERSIONMINOR(VERSION()))
      ) {
        throw new OdalPapiProcessError(
          `Server ${serverAddr.ip}:${serverAddr.port} is version ${VERSIONMAJOR(SvVersion)}.${VERSIONMINOR(SvVersion)}.${VERSIONPATCH(SvVersion)} which is not supported`,
          true,
        );
      }

      server.responded = true;
      server.pTime = this.read32(response);
      server.versionRealProtocol = this.read32(response);
      server.versionRevStr = this.readString(response);

      // Process CVARs
      const cvarCount = this.read8(response);
      for (let i = 0; i < cvarCount; i++) {
        const cvar: any = { name: '', value: '', cType: 0 };
        cvar.name = this.readString(response);
        cvar.cType = this.read8(response);

        switch (cvar.cType) {
          case OdalPapi.CvarType.CVARTYPE_BOOL:
            cvar.b = true;
            break;
          case OdalPapi.CvarType.CVARTYPE_BYTE:
            cvar.ui8 = this.read8(response);
            break;
          case OdalPapi.CvarType.CVARTYPE_WORD:
            cvar.ui16 = this.read16(response);
            break;
          case OdalPapi.CvarType.CVARTYPE_INT:
            cvar.i32 = this.read32(response);
            break;
          case OdalPapi.CvarType.CVARTYPE_FLOAT:
          case OdalPapi.CvarType.CVARTYPE_STRING:
            cvar.value = this.readString(response);
            break;
        }

        if (cvar.name === 'sv_hostname') server.name = cvar.value;
        if (cvar.name === 'sv_maxplayers') server.maxPlayers = cvar.ui8;
        if (cvar.name === 'sv_maxclients') server.maxClients = cvar.ui8;
        if (cvar.name === 'sv_gametype') server.gameType = cvar.ui8;
        if (cvar.name === 'sv_scorelimit') server.scoreLimit = cvar.ui16;
        if (cvar.name === 'sv_timelimit') server.timeLimit = parseFloat(cvar.value);
        if (cvar.name === 'g_lives') server.lives = cvar.ui16;
        if (cvar.name === 'g_sides') server.sides = cvar.ui16;

        server.cvars.push(cvar);
      }

      server.passwordHash = this.readHexString(response);
      server.currentMap = this.readString(response);

      if (server.timeLimit && server.timeLimit > 0) {
        server.timeLeft = this.read16(response);
      }

      // Teams
      if (
        server.gameType === OdalPapi.GameType.GT_TeamDeathmatch ||
        server.gameType === OdalPapi.GameType.GT_CaptureTheFlag
      ) {
        const teamCount = this.read8(response);
        for (let i = 0; i < teamCount; i++) {
          server.teams.push({
            name: this.readString(response),
            color: this.read32(response),
            score: this.read16(response),
          });
        }
      }

      // Patches
      const patchCount = this.read8(response);
      for (let i = 0; i < patchCount; i++) {
        server.patches.push(this.readString(response));
      }

      // WADs
      const wadCount = this.read8(response);
      for (let i = 0; i < wadCount; i++) {
        server.wads.push({
          name: this.readString(response),
          hash: this.readHexString(response),
        });
      }

      // Players
      const playerCount = this.read8(response);
      for (let i = 0; i < playerCount; i++) {
        const player: any = {
          name: this.readString(response),
          color: this.read32(response),
          kills: 0,
          deaths: 0,
          time: 0,
          frags: 0,
          ping: 0,
          team: 0,
          spectator: false,
        };

        if (
          server.gameType === OdalPapi.GameType.GT_TeamDeathmatch ||
          server.gameType === OdalPapi.GameType.GT_CaptureTheFlag
        ) {
          player.team = this.read8(response);
        }

        player.ping = this.read16(response);
        player.time = this.read16(response);
        player.spectator = this.read8(response) > 0;
        player.frags = this.read16(response);
        player.kills = this.read16(response);
        player.deaths = this.read16(response);

        server.players.push(player);
      }
    } catch (e) {
      console.error('Server response parsing error:', e);
    }

    return server;
  }

  processMasterResponse(response: Buffer) {
    let start = 0;
    const baseList: Array<ServerIdentity> = [];

    const masterResponse = response.readUInt32LE(start);
    start += 4;
    const count = response.readUInt16LE(start);
    start += 2;

    while (start + 4 < response.length) {
      const serverIPstring =
        response.readUInt8(start + 0) +
        '.' +
        response.readUInt8(start + 1) +
        '.' +
        response.readUInt8(start + 2) +
        '.' +
        response.readUInt8(start + 3);

      baseList.push({
        ip: serverIPstring,
        port: response.readUInt16LE(start + 4),
      });

      start += 6;
    }

    return baseList;
  }

  translateResponse(tagId: number, tagApplication: number, tagQRId: number, tagPacketType: number) {
    if (tagQRId !== 2) return false;
    if (tagApplication !== 3) return false;
    if (tagPacketType === 2) return false;
    return true;
  }

  readString(buffer: Buffer) {
    const r: string[] = [];
    let ch = buffer.toString('utf8', this.currentIndex, this.currentIndex + 1);
    this.currentIndex++;

    while (ch !== '\0' && this.currentIndex < buffer.length) {
      r.push(ch);
      ch = buffer.toString('utf8', this.currentIndex, this.currentIndex + 1);
      this.currentIndex++;
    }

    return r.join('');
  }

  read8(buffer: Buffer) {
    const r = buffer.readUInt8(this.currentIndex);
    this.currentIndex += 1;
    return r;
  }

  read16(buffer: Buffer) {
    const r = buffer.readUInt16LE(this.currentIndex);
    this.currentIndex += 2;
    return r;
  }

  read32(buffer: Buffer) {
    const r = buffer.readUInt32LE(this.currentIndex);
    this.currentIndex += 4;
    return r;
  }

  readHexString(buffer: Buffer) {
    const size = this.read8(buffer);
    if (size === 0) return '';

    const r = buffer.toString('hex', this.currentIndex, this.currentIndex + size);
    this.currentIndex += size;
    return r;
  }
}
