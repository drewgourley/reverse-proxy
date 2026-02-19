// Minimal shared types to speed up the TS migration.
// Add more fields as we convert modules.

export type Json = string | number | boolean | null | JsonObject | Json[];
export interface JsonObject { [key: string]: Json }

export interface WebsocketProxy {
  upgrade: (req: any, socket: any, head: any) => void;
}

export interface ProxyConfig {
  socket?: boolean;
  websocket?: WebsocketProxy;
  [key: string]: any;
}

export interface SubdomainConfig {
  proxy?: ProxyConfig;
  [key: string]: any;
}

export interface Service {
  subdomain?: SubdomainConfig;
  [key: string]: any; // keep permissive for now
}

export interface Config {
  domain: string;
  services: Record<string, Service>;
  [key: string]: any;
}

export type Secrets = Record<string, any>;
export type Users = Record<string, any>;
export type Ddns = Record<string, any>;
export type AdvancedConfig = Record<string, any>;

export interface Configs {
  config: Config;
  secrets: Secrets;
  users: Users;
  ddns: Ddns;
  advancedConfig: AdvancedConfig;
  blocklist: string[];
}
