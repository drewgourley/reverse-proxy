"use strict";

/**
 * WARNING: Functions in this module update DNS records automatically.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const got = require('got');

/**
 * Initializes DDNS updates if configured
 * @param {object} ddns - DDNS configuration
 * @param {object} config - Main configuration
 * @param {string} env - Environment (production, development, etc.)
 * @param {object} cron - Node-cron instance
 */
function initDDNS(ddns, config, env, cron) {
  if (!ddns || !ddns.active || !ddns.aws_access_key_id || !ddns.aws_secret_access_key || 
      !ddns.aws_region || !ddns.route53_hosted_zone_id) {
    return;
  }

  const { Route53Client, ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
  const route53 = new Route53Client({
    region: ddns.aws_region,
    credentials: {
      accessKeyId: ddns.aws_access_key_id,
      secretAccessKey: ddns.aws_secret_access_key,
    },
  });

  let lastKnownIP = null;

  const updateDNSRecord = async () => {
    try {
      const response = await got('https://checkip.amazonaws.com/', { timeout: { request: 5000 } });
      const publicIP = response.body.trim();

      if (publicIP === lastKnownIP) {
        return;
      }

      const changes = [{
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: config.domain,
          Type: 'A',
          TTL: 300,
          ResourceRecords: [{ Value: publicIP }],
        },
      },
      {
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: `*.${config.domain}`,
          Type: 'A',
          TTL: 300,
          ResourceRecords: [{ Value: publicIP }],
        },
      }];

      const now = new Date().toISOString();
      
      if (env === 'development') {
        console.log(`${now}: DDNS update skipped in development mode:`, changes);
        lastKnownIP = publicIP;
        return;
      }

      const params = {
        ChangeBatch: {
          Changes: changes,
          Comment: 'Updated automatically by Dynamic DNS',
        },
        HostedZoneId: ddns.route53_hosted_zone_id,
      };

      const command = new ChangeResourceRecordSetsCommand(params);
      await route53.send(command);
      console.log(`${now}: DDNS updated to ${publicIP}`);
      lastKnownIP = publicIP;
    } catch (error) {
      const now = new Date().toISOString();
      console.error(`${now}: DDNS update failed: ${error}`);
    }
  };

  // Initial update
  updateDNSRecord();

  // Schedule periodic updates in production
  if (env === 'production') {
    cron.schedule('*/5 * * * *', () => {
      updateDNSRecord();
    });
  }
}

module.exports = {
  initDDNS
};
