const dgram = require('dgram');

class OdalPapiProcessError {
	message = '';
	removeServer = false;

	constructor(message, removeServer = false) {
		this.message = message;
		this.removeServer = removeServer;
	}
}

class OdalPapiServerInfo {
  address = {ip: '', port: 0};
  patches = [];
  cvars = [];
  teams = [];
  wads = [];
  players = [];
  name = null; // Launcher specific: Server name
  passwordHash = null;
  currentMap = null;
  versionRevStr = null;
  gameType = 0; // Launcher specific: Game type
  response = null; // Launcher specific: Server response
  versionRevision = null;
  versionProtocol = null;
  versionRealProtocol = null;
  pTime = null;
  scoreLimit = null; // Launcher specific: Score limit
  timeLimit = null;
  timeLeft = null;
  versionMajor = null; // Launcher specific: Version fields
  versionMinor = null;
  versionPatch = null;
  maxClients = null; // Launcher specific: Maximum clients
  maxPlayers = null; // Launcher specific: Maximum players
  lives = null;
  sides = null;
  responded = false;

  ping = 0;

  constructor() {}
}

class OdalPapiService {
  TAG_ID = 0xAD0;

  PROTOCOL_VERSION = 9;
  VERSIONMAJOR(V) { return Math.floor(V / 256); }
  VERSIONMINOR(V) { return Math.floor((V % 256) / 10); }
  VERSIONPATCH(V) { return Math.floor((V % 256) % 10); }
  VERSION() { return Math.floor(0 * 256 + (this.PROTOCOL_VERSION*10)); }
  
  OdalPapi = {
    MASTER_CHALLENGE: 777123,
    MASTER_RESPONSE: 777123,
    SERVER_CHALLENGE: 0xAD011002,
    SERVER_VERSION_CHALLENGE: 0xAD011001,
    PING_CHALLENGE: 1,
  }

  CvarType = {
		CVARTYPE_NONE: 0,
		CVARTYPE_BOOL: 1,
		CVARTYPE_BYTE: 2,
		CVARTYPE_WORD: 3,
		CVARTYPE_INT: 4,
		CVARTYPE_FLOAT: 5,
		CVARTYPE_STRING: 6,
		CVARTYPE_MAX: 255,
	}

  GameType = {
		GT_Cooperative: 0,
		GT_Deathmatch: 1,
		GT_TeamDeathmatch: 2,
		GT_CaptureTheFlag: 3,
		GT_Max: 4,
	}

  queryGameServer(serverIdentity, single = false) {
		return new Promise((resolve, reject) => {
			const timeout = 10000;
			const socket = dgram.createSocket('udp4');
			const cb = Buffer.alloc(4);

			const pingObj = {
				start: Date.now(),
				end: 0
			};

			const id = setTimeout(() => {
				clearTimeout(id);
				socket.close();
				reject(`${serverIdentity} query timed out`);
				return;
			}, timeout);

			cb.writeUInt32LE(this.OdalPapi.SERVER_CHALLENGE, 0);

			socket.on('message', (response, info) => {
				clearTimeout(id);
				socket.close();
				pingObj.end = Date.now();
				const pingDivisor = single === true ? 1 : 2;
				const pingResponse = Math.ceil((pingObj.end - pingObj.start) / pingDivisor);
				const server = this.processGameServerResponse(response, info);
				resolve({server, pingResponse});
				return;
			});

			socket.on('error', (err) => {
				console.error("Server response error:", err);
				clearTimeout(id);
				socket.close();
				reject(err);
				return;
			});

			socket.send(cb, serverIdentity.port, serverIdentity.ip, err => {
				if (err) {
					clearTimeout(id);
					socket.close();
					reject(err);
				}
			});
		});
	}


	pingGameServer(serverIdentity, callback) {
		const pingObj = {
			start: Date.now(),
			end: 0
		};

		const pingBuf = Buffer.alloc(4);
		pingBuf.writeUInt32LE(this.OdalPapi.PING_CHALLENGE, 0);

		dgram.createSocket('udp4', () => {
			pingObj.end = Date.now();
			const pingResponse = pingObj.end - pingObj.start;
			callback(pingResponse);
		}).send(pingBuf, serverIdentity.port, serverIdentity.ip);
	}

	processGameServerResponse(response, info) {
		const server = new OdalPapiServerInfo();

		try {
			server.address = {ip: info.address, port: info.port};
			this.currentIndex = 0;

			const r = this.read32(response);

			const tagId = ((r >> 20) & 0x0FFF);
			const tagApplication = ((r >> 16) & 0x0F);
			const tagQRId = ((r >> 12) & 0x0F);
			const tagPacketType = (r & 0xFFFF0FFF);
			let validResponse = false;

			if (tagId === this.TAG_ID) {
				const tResult = this.translateResponse(tagId, tagApplication, tagQRId, tagPacketType);
				validResponse = tResult ? true : false;
			}

			if (!validResponse) {
				throw new OdalPapiProcessError(`Received invalid response from', ${server.address.ip}:${server.address.port}`);
			}

			const SvVersion = this.read32(response);
			const SvProtocolVersion = this.read32(response);

			// Prevent possible divide by zero
			if (SvVersion === 0) {
				throw new OdalPapiProcessError('Version issue');
			}

			server.versionMajor = this.VERSIONMAJOR(SvVersion);
			server.versionMinor = this.VERSIONMINOR(SvVersion);
			server.versionPatch = this.VERSIONPATCH(SvVersion);
			server.versionProtocol = SvProtocolVersion;

			if ((this.VERSIONMAJOR(SvVersion) < this.VERSIONMAJOR(this.VERSION())) ||
			(this.VERSIONMAJOR(SvVersion) <= this.VERSIONMAJOR(this.VERSION()) && this.VERSIONMINOR(SvVersion) < this.VERSIONMINOR(this.VERSION()))) {
				// Server is an older version
				throw new OdalPapiProcessError(
					`Server ${info.address}:${info.port} is version ${this.VERSIONMAJOR(SvVersion)}.${this.VERSIONMINOR(SvVersion)}.${this.VERSIONPATCH(SvVersion)} which is not supported`,
					true
				);
			}

			// Passed version checks, we'll count it
			server.responded = true;

			server.pTime = this.read32(response);

			server.versionRealProtocol = this.read32(response);

			// TODO: Remove guard if not needed
			server.versionRevStr = this.readString(response);

			// Process CVARs
			const cvarCount = this.read8(response);
			//console.log("CVAR count:", cvarCount);

			for (let i = 0; i < cvarCount; i++) {
				const cvar = { name: '', value: '', cType: 0 };

				cvar.name = this.readString(response);
				cvar.cType = this.read8(response);

				switch (cvar.cType) {
					case this.CvarType.CVARTYPE_BOOL:
						cvar.b = true;
					break;
					case this.CvarType.CVARTYPE_BYTE:
						cvar.ui8 = this.read8(response);
					break;
					case this.CvarType.CVARTYPE_WORD:
						cvar.ui16 = this.read16(response);
					break;
					case this.CvarType.CVARTYPE_INT:
						cvar.i32 = this.read32(response);
					break;
					case this.CvarType.CVARTYPE_FLOAT:
					case this.CvarType.CVARTYPE_STRING:
						cvar.value = this.readString(response);
					break;

					case this.CvarType.CVARTYPE_NONE:
					case this.CvarType.CVARTYPE_MAX:
					default:
					break;
				}

				// Traverse CVAR values for server info

				if (cvar.name === 'sv_hostname') {
					server.name = cvar.value;
					continue;
				}

				if (cvar.name === 'sv_maxplayers') {
					server.maxPlayers = cvar.ui8;
					continue;
				}

				if (cvar.name === 'sv_maxclients') {
					server.maxClients = cvar.ui8;
					continue;
				}

				if (cvar.name === 'sv_gametype') {
					server.gameType = cvar.ui8;
					continue;
				}

				if (cvar.name === 'sv_scorelimit') {
					server.scoreLimit = cvar.ui16;
					continue;
				}

				if (cvar.name === 'sv_timelimit') {
					//server.timeLimit = cvar.ui16;
					server.timeLimit = parseFloat(cvar.value);
				}
				if (cvar.name == "g_lives") {
					server.lives = cvar.ui16;
				}
				else if(cvar.name == "g_sides")
				{
					server.sides = cvar.ui16;
				}

				server.cvars.push(cvar);
			}

			// Get password hash (private server)
			server.passwordHash = this.readHexString(response);

			// Get current map
			server.currentMap = this.readString(response);

			// Get Time left
			if (server.timeLimit > 0) {
				server.timeLeft = this.read16(response);
			}

			// Teams

			if (server.gameType === this.GameType.GT_TeamDeathmatch ||
				server.gameType === this.GameType.GT_CaptureTheFlag) {

				const teamCount = this.read8(response);

				for (let i = 0; i < teamCount; ++i) {
					const team = {name: '', color: 0, score: 0 };

					team.name = this.readString(response);
					team.color = this.read32(response);
					team.score = this.read16(response);

					server.teams.push(team);
				}
			}

			// Dehacked/Bex files
			const patchCount = this.read8(response);
			//console.log("patch count:",patchCount);

			for (let i = 0; i < patchCount; ++i) {
				let patch = '';

				patch = this.readString(response);

				server.patches.push(patch);
			}

			// Wad files
			const wadCount = this.read8(response);
			//console.log("wad count:", wadCount);

			for (let i = 0; i < wadCount; ++i) {
				const wad = {name: '', hash: ''};

				wad.name = this.readString(response);
				wad.hash = this.readHexString(response);

				server.wads.push(wad);
				//console.log(server.wads);
			}


			// Player information
			const playerCount = this.read8(response);

			for (let i = 0; i < playerCount; ++i) {
				const player = {
					name: '', color: 0, kills: 0, ping: 0, deaths: 0, frags: 0, spectator: false, time: 0, team: 0
				};

				player.name = this.readString(response);
				player.color = this.read32(response);

				if (server.gameType === this.GameType.GT_TeamDeathmatch ||
						server.gameType === this.GameType.GT_CaptureTheFlag) {
					player.team = this.read8(response);
				}

				player.ping = this.read16(response);
				player.time = this.read16(response);
				player.spectator = (this.read8(response) > 0);
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

	translateResponse(tagId, tagApplication, tagQRId, tagPacketType) {
		let r = true;

		// It isn't a response
		if (tagQRId !== 2) {
			// console.log('Query/Response Id is not valid');
			return false;
		}

		switch (tagApplication) {

			// Server
			case 3:
				// console.log('Application is Server');
			break;

			case 1: // ("Application is Enquirer"));
			case 2: // ("Application is Client"));
			case 4: // ("Application is Master Server"));
			default: // ("Application is Unknown"));
				//console.log('Value is ', tagApplication);
				r = false;
			break;
		}

		if (r === false) {
			return false;
		}

		if (tagPacketType === 2) {
			// Launcher is an old version
			//console.log('Launcher is too old to parse the data from Server.');
			return false;
		}

		// Success
		return true;
	}

	readString(buffer) {
		const r = [];

		let ch = this.utf8Decode(buffer.toString('utf8', this.currentIndex, this.currentIndex + 1));
		let isRead = (ch.length > 0);

		this.currentIndex++;

		while (ch !== '\0' && isRead === true) {
			r.push(ch);
			ch = this.utf8Decode(buffer.toString('utf8', this.currentIndex, this.currentIndex + 1));
			this.currentIndex++;
			if (this.currentIndex + 1 > buffer.toString('utf8').length) {
				isRead = false;
			}
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
		let r = '';
		const size = this.read8(buffer);

		if (size > 0) {
			r = buffer.toString('hex', this.currentIndex, this.currentIndex + size);
			this.currentIndex += size;
		}

		return r;
	}

	utf8Decode(utf8String) {
		if (typeof utf8String != 'string') {
			throw new TypeError('parameter ‘utf8String’ is not a string');
		}

		// note: decode 3-byte chars first as decoded 2-byte strings could appear to be 3-byte char!
		const unicodeString = utf8String.replace(
			/[\u00e0-\u00ef][\u0080-\u00bf][\u0080-\u00bf]/g,  // 3-byte chars
			(c) => {  // (note parentheses for precedence)
				const cc = ((c.charCodeAt(0)&0x0f)<<12) | ((c.charCodeAt(1)&0x3f)<<6) | ( c.charCodeAt(2)&0x3f);
				return String.fromCharCode(cc);
			}
		).replace(
			/[\u00c0-\u00df][\u0080-\u00bf]/g,                 // 2-byte chars
			(c) => {  // (note parentheses for precedence)
				const cc = (c.charCodeAt(0)&0x1f)<<6 | c.charCodeAt(1)&0x3f;
				return String.fromCharCode(cc);
			}
		);
		return unicodeString;
	}

  constructor () {};
}

exports.OdalPapiService = new OdalPapiService();
