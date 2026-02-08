"use strict";

/**
 * WARNING: Functions in this module process data from external services and game servers.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const dgram = require('dgram');

/** Tag identifier for OdalPapi packets */
const TAG_ID = 0xAD0;

/** Current OdalPapi protocol version */
const PROTOCOL_VERSION = 9;

/** Extract major version number from protocol version */
function VERSIONMAJOR(V) { return Math.floor(V / 256); }

/** Extract minor version number from protocol version */
function VERSIONMINOR(V) { return Math.floor((V % 256) / 10); }

/** Extract patch version number from protocol version */
function VERSIONPATCH(V) { return Math.floor((V % 256) % 10); }

/** Calculate full version number for protocol */
function VERSION() { return Math.floor(0 * 256 + (PROTOCOL_VERSION*10)); }

/**
 * OdalPapi protocol constants
 */
const OdalPapi = {
  /** Challenge value sent to master server */
  MASTER_CHALLENGE: 777123,
  
  /** Expected response value from master server */
  MASTER_RESPONSE: 777123,
  
  /** Challenge value for querying game server information */
  SERVER_CHALLENGE: 0xAD011002,
  
  /** Challenge value for querying server version */
  SERVER_VERSION_CHALLENGE: 0xAD011001,
  
  /** Challenge value for pinging a server */
  PING_CHALLENGE: 1,

  /**
   * Console variable (cvar) data types
   */
  CvarType: {
    CVARTYPE_NONE: 0,
    CVARTYPE_BOOL: 1,
    CVARTYPE_BYTE: 2,
    CVARTYPE_WORD: 3,
    CVARTYPE_INT: 4,
    CVARTYPE_FLOAT: 5,
    CVARTYPE_STRING: 6,
    CVARTYPE_MAX: 255
  },

  /**
   * Game mode types
   */
  GameType: {
    /** Cooperative gameplay against monsters */
    GT_Cooperative: 0,
    /** Free-for-all deathmatch */
    GT_Deathmatch: 1,
    /** Team-based deathmatch */
    GT_TeamDeathmatch: 2,
    /** Capture the flag */
    GT_CaptureTheFlag: 3,
    GT_Max: 4
  }
};

/**
 * Custom error class for OdalPapi processing errors
 */
class OdalPapiProcessError extends Error {
  /**
   * @param {string} message Error message
   * @param {boolean} removeServer Whether to remove the server from the list
   */
  constructor(message, removeServer = false) {
    super(message);
    this.removeServer = removeServer;
  }
}

/**
 * OdalPapi main service for querying Odamex master and game servers
 * 
 * Handles UDP socket communication for:
 * - Querying master server for list of game servers
 * - Querying individual game servers for detailed information
 * - Pinging servers for latency measurement
 * 
 * @example
 * const service = new OdalPapiMainService();
 * const servers = await service.queryMasterServer('master1.odamex.net:15000');
 */
class OdalPapiMainService {
  constructor() {
    this.currentIndex = 0;
  }

  /**
   * Query the master server for a list of active game servers
   * 
   * @param {string} ip Master server address in format "hostname:port" or "ip:port"
   * @returns {Promise<Array>} Promise resolving to array of server addresses
   * @throws {Error} If query times out or fails
   * 
   * @example
   * const servers = await service.queryMasterServer('master1.odamex.net:15000');
   * console.log(`Found ${servers.length} servers`);
   */
  queryMasterServer(ip) {
    return new Promise((resolve, reject) => {
      const timeout = 10000;
      const socket = dgram.createSocket('udp4');
      const cb = Buffer.alloc(4);
      let timeoutId = null;
      let isResolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        try {
          socket.close();
        } catch (err) {
          // Socket may already be closed
        }
      };

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error("Master server query timed out"));
        }
      }, timeout);

      cb.writeUInt32LE(OdalPapi.MASTER_CHALLENGE, 0);

      socket.on('message', (response) => {
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
          console.error("Master server error:", err);
          cleanup();
          reject(err);
        }
      });

      socket.send(cb, 15000, ip, err => {
        if (err && !isResolved) {
          isResolved = true;
          cleanup();
          reject(err);
        }
      });
    });
  }

  queryGameServer(serverIdentity) {
    return new Promise((resolve, reject) => {
      const timeout = 10000;
      const socket = dgram.createSocket('udp4');
      const cb = Buffer.alloc(4);
      const pingStart = Date.now();
      let timeoutId = null;
      let isResolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        try {
          socket.close();
        } catch (err) {
          // Socket may already be closed
        }
      };

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error(`Query timeout for ${serverIdentity.ip}:${serverIdentity.port} after ${timeout}ms`));
        }
      }, timeout);

      cb.writeUInt32LE(OdalPapi.SERVER_CHALLENGE, 0);

      socket.on('message', (response) => {
        if (!isResolved) {
          isResolved = true;
          try {
            const pingResponse = Math.ceil((Date.now() - pingStart) / 2);
            const server = this.processGameServerResponse(response, serverIdentity);
            
            if (server.responded) {
              cleanup();
              resolve({server, pong: pingResponse});
            } else {
              cleanup();
              reject(new Error(`Invalid response from ${serverIdentity.ip}:${serverIdentity.port}`));
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
          reject(new Error(`Query error for ${serverIdentity.ip}:${serverIdentity.port}: ${err.message}`));
        }
      });

      socket.send(cb, serverIdentity.port, serverIdentity.ip, err => {
        if (err && !isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error(`Failed to send query to ${serverIdentity.ip}:${serverIdentity.port}: ${err.message}`));
        }
      });
    });
  }

  pingGameServer(serverIdentity) {
    return new Promise((resolve, reject) => {
      const pingStart = Date.now();
      const pingBuf = Buffer.alloc(4);
      pingBuf.writeUInt32LE(OdalPapi.PING_CHALLENGE, 0);

      const socket = dgram.createSocket('udp4');
      let timeoutId = null;
      let isResolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        try {
          socket.close();
        } catch (err) {
          // Socket may already be closed
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
          reject(new Error(`Ping error for ${serverIdentity.ip}:${serverIdentity.port}: ${err.message}`));
        }
      });

      socket.send(pingBuf, serverIdentity.port, serverIdentity.ip, (err) => {
        if (err && !isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error(`Failed to send ping to ${serverIdentity.ip}:${serverIdentity.port}: ${err.message}`));
        }
      });
    });
  }

  processGameServerResponse(response, serverAddr) {
    const server = {
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
      ping: 0
    };

    try {
      this.currentIndex = 0;

      const r = this.read32(response);
      const tagId = ((r >> 20) & 0x0FFF);
      const tagApplication = ((r >> 16) & 0x0F);
      const tagQRId = ((r >> 12) & 0x0F);
      const tagPacketType = (r & 0xFFFF0FFF);

      if (tagId !== TAG_ID || !this.translateResponse(tagId, tagApplication, tagQRId, tagPacketType)) {
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

      if ((VERSIONMAJOR(SvVersion) < VERSIONMAJOR(VERSION())) ||
        (VERSIONMAJOR(SvVersion) <= VERSIONMAJOR(VERSION()) && VERSIONMINOR(SvVersion) < VERSIONMINOR(VERSION()))) {
        throw new OdalPapiProcessError(
          `Server ${serverAddr.ip}:${serverAddr.port} is version ${VERSIONMAJOR(SvVersion)}.${VERSIONMINOR(SvVersion)}.${VERSIONPATCH(SvVersion)} which is not supported`,
          true
        );
      }

      server.responded = true;
      server.pTime = this.read32(response);
      server.versionRealProtocol = this.read32(response);
      server.versionRevStr = this.readString(response);

      // Process CVARs
      const cvarCount = this.read8(response);
      for (let i = 0; i < cvarCount; i++) {
        const cvar = { name: '', value: '', cType: 0 };
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
      if (server.gameType === OdalPapi.GameType.GT_TeamDeathmatch || 
          server.gameType === OdalPapi.GameType.GT_CaptureTheFlag) {
        const teamCount = this.read8(response);
        for (let i = 0; i < teamCount; i++) {
          server.teams.push({
            name: this.readString(response),
            color: this.read32(response),
            score: this.read16(response)
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
          hash: this.readHexString(response)
        });
      }

      // Players
      const playerCount = this.read8(response);
      for (let i = 0; i < playerCount; i++) {
        const player = {
          name: this.readString(response),
          color: this.read32(response),
          kills: 0,
          deaths: 0,
          time: 0,
          frags: 0,
          ping: 0,
          team: 0,
          spectator: false
        };

        if (server.gameType === OdalPapi.GameType.GT_TeamDeathmatch || 
            server.gameType === OdalPapi.GameType.GT_CaptureTheFlag) {
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
      console.error("Server response parsing error:", e);
    }

    return server;
  }

  processMasterResponse(response) {
    let start = 0;
    const baseList = [];

    const masterResponse = response.readUInt32LE(start);
    start += 4;
    const count = response.readUInt16LE(start);
    start += 2;

    while (start + 4 < response.length) {
      const serverIPstring = 
        response.readUInt8(start + 0) + '.' +
        response.readUInt8(start + 1) + '.' +
        response.readUInt8(start + 2) + '.' +
        response.readUInt8(start + 3);

      baseList.push({
        ip: serverIPstring,
        port: response.readUInt16LE(start + 4)
      });

      start += 6;
    }

    return baseList;
  }

  translateResponse(tagId, tagApplication, tagQRId, tagPacketType) {
    if (tagQRId !== 2) return false;
    if (tagApplication !== 3) return false;
    if (tagPacketType === 2) return false;
    return true;
  }

  readString(buffer) {
    const r = [];
    let ch = buffer.toString('utf8', this.currentIndex, this.currentIndex + 1);
    this.currentIndex++;

    while (ch !== '\0' && this.currentIndex < buffer.length) {
      r.push(ch);
      ch = buffer.toString('utf8', this.currentIndex, this.currentIndex + 1);
      this.currentIndex++;
    }

    return r.join('');
  }

  read8(buffer) {
    const r = buffer.readUInt8(this.currentIndex);
    this.currentIndex += 1;
    return r;
  }

  read16(buffer) {
    const r = buffer.readUInt16LE(this.currentIndex);
    this.currentIndex += 2;
    return r;
  }

  read32(buffer) {
    const r = buffer.readUInt32LE(this.currentIndex);
    this.currentIndex += 4;
    return r;
  }

  readHexString(buffer) {
    const size = this.read8(buffer);
    if (size === 0) return '';
    
    const r = buffer.toString('hex', this.currentIndex, this.currentIndex + size);
    this.currentIndex += size;
    return r;
  }
}

module.exports = {
  TAG_ID,
  PROTOCOL_VERSION,
  OdalPapi,
  OdalPapiMainService
};
