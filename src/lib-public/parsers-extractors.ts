import cheerio from 'cheerio';

export type ParserFn = (body: any) => any;
export type ExtractorFn = (state: any) => any;

export const defaultParsers: Record<string, ParserFn> = {
  hass: (body: any) => {
    const dom = cheerio.load(body);
    const health = dom('.connected').last().text();
    return Boolean(health && health.toLowerCase().indexOf('healthy') > -1);
  },
  radio: (body: any) => {
    const json = JSON.parse(body);
    return Boolean(json.icestats && json.icestats.source);
  },
  body: (body: any) => body !== null && body !== undefined,
};

export const defaultExtractors: Record<string, ExtractorFn> = {
  doom: (state: any) => ({
    online: state.server.players.length,
    max: state.server.maxPlayers,
    version: `${state.server.versionMajor}.${state.server.versionMinor}.${state.server.versionPatch}`,
  }),
  minecraft: (state: any) => ({
    online: state.numplayers,
    max: state.maxplayers,
    version: state.raw?.bedrock?.raw?.mcVersion,
  }),
  valheim: (state: any) => ({
    online: state.numplayers,
    max: state.maxplayers,
    version: state.raw?.version,
  }),
  radio: (state: any) => {
    const json = JSON.parse(state);
    if (json.icestats && json.icestats.source) {
      return {
        online: json.icestats.source.listeners || 0,
        version: json.icestats.source.title,
      };
    }
    return undefined;
  },
};

export function setupParsersAndExtractors(advancedConfig: any) {
  const parsers: Record<string, ParserFn> = { ...defaultParsers };
  const extractors: Record<string, ExtractorFn> = { ...defaultExtractors };

  if (advancedConfig?.parsers) {
    Object.keys(advancedConfig.parsers).forEach((key) => {
      try {
        parsers[key] = eval(`(${advancedConfig.parsers[key]})`);
      } catch (error) {
        const now = new Date().toISOString();
        console.error(`${now}: Error loading custom parser "${key}":`, error);
      }
    });
  }

  if (advancedConfig?.extractors) {
    Object.keys(advancedConfig.extractors).forEach((key) => {
      try {
        extractors[key] = eval(`(${advancedConfig.extractors[key]})`);
      } catch (error) {
        const now = new Date().toISOString();
        console.error(`${now}: Error loading custom extractor "${key}":`, error);
      }
    });
  }

  return { parsers, extractors };
}
