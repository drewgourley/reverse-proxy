import got from 'got';
const { GameDig }: any = require('gamedig');
import path from 'path';

export type HealthReport = {
  service: string;
  healthy: boolean;
  deck: string;
  meta?: any;
  error?: any;
};

export function checkService(
  name: string,
  config: any,
  protocols: Record<string, string>,
  parsers: Record<string, (arg: any) => any>,
  extractors: Record<string, (arg: any) => any>,
  odalpapiService: any,
  callback: (report: HealthReport) => void,
) {
  const service = config.services[name];
  const check = service?.healthcheck;
  const report: HealthReport = {
    service: name,
    healthy: false,
    deck: 'deckunhealthy',
  };

  if (check && check.type && check.path) {
    if (check.meta) {
      report.meta = { ...check.meta };
    }
    if (report.meta?.link) {
      report.meta.link = `${protocols[service.subdomain.protocol]}${name}.${config.domain}`;
    }

    if (check.type === 'http') {
      got(`${protocols.insecure}${check.path}`, { timeout: { request: check.timeout || 1000 } })
        .then((response: any) => {
          if (parsers[check.parser] && parsers[check.parser](response.body)) {
            report.healthy = true;
            report.deck = 'deckhealthy';
            if (check.extractor && extractors[check.extractor] && report.meta) {
              Object.assign(report.meta, extractors[check.extractor](response.body));
            }
          }
          callback(report);
        })
        .catch((error: any) => {
          report.error = error;
          callback(report);
        });
    } else if (check.type === 'gamedig') {
      GameDig.query({
        type: check.queryType,
        host: check.path,
      })
        .then((state: any) => {
          report.healthy = true;
          report.deck = 'deckhealthy';
          if (check.extractor && extractors[check.extractor] && report.meta) {
            Object.assign(report.meta, extractors[check.extractor](state));
          }
          callback(report);
        })
        .catch((error: any) => {
          report.error = error;
          callback(report);
        });
    } else if (check.type === 'odalpapi') {
      const hostParts = check.path.split(':');
      odalpapiService
        .queryGameServer({
          ip: hostParts[0],
          port: hostParts[1],
        })
        .then((state: any) => {
          report.healthy = true;
          report.deck = 'deckhealthy';
          if (check.extractor && extractors[check.extractor] && report.meta) {
            Object.assign(report.meta, extractors[check.extractor](state));
          }
          callback(report);
        })
        .catch((error: any) => {
          report.error = error;
          callback(report);
        });
    }
  } else if (check?.id && name === 'api') {
    report.healthy = true;
    report.deck = 'deckhealthy';
    callback(report);
  } else {
    report.error = 'Healthcheck Config Incomplete';
    callback(report);
  }
}

export async function pingHealthcheck(
  name: string,
  config: any,
  protocols: Record<string, string>,
) {
  const id = config.services?.[name]?.healthcheck?.id;
  if (id) {
    const now = new Date().toISOString();
    try {
      const ping = await got(`${protocols.secure}${path.join('hc-ping.com', id)}`, {
        timeout: { request: 5000 },
      });
      console.log(`${now}: ${name} healthcheck ping succeeded. ${ping.body}`);
    } catch (error: any) {
      console.log(`${now}: ${name} healthcheck ping failed. ${error}`);
    }
  }
}
