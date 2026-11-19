import type { Connector, ConnectorRegistry } from '../contracts';
import { createInternalConnector } from './internal';
import { createEmailConnector, createVoiceTtsConnector, createWhatsAppConnector } from './stubs';
import { createWebhookConnector } from './webhook';

/** Registro de conectores. Para sumar uno nuevo: crea el archivo y agregalo a esta lista. */
export function createConnectorRegistry(extra: Connector[] = []): ConnectorRegistry {
  const map = new Map<string, Connector>();
  for (const c of [
    createInternalConnector(),
    createWebhookConnector(),
    createWhatsAppConnector(),
    createVoiceTtsConnector(),
    createEmailConnector(),
    ...extra,
  ]) {
    map.set(c.info.key, c);
  }
  return {
    list: () => [...map.values()].map((c) => c.info),
    get: (key) => map.get(key) ?? null,
  };
}

export { createInternalConnector, internalReference } from './internal';
export { createWebhookConnector, isPrivateAddress } from './webhook';
export { createEmailConnector, createVoiceTtsConnector, createWhatsAppConnector } from './stubs';
