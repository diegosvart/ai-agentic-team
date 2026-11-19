// Debe ir primero: los imports se evaluan en orden y node:sqlite avisa al cargarse.
import './api/quiet-warnings';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config';
import { createStore } from './store/index';
import { createEventBus } from './events/index';
import { createLLMProvider } from './llm/index';
import { createConnectorRegistry } from './connectors/index';
import { createEngine } from './engine/index';
import { buildApp } from './api/index';

/** Carga agentic-office/.env si existe. Las variables ya definidas en el entorno tienen prioridad. */
function loadDotEnv(): void {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  loadDotEnv();
  const config = loadConfig();
  if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });

  const store = createStore(config.dbPath);
  store.init();
  const bus = createEventBus();
  const llm = createLLMProvider(config);
  const connectors = createConnectorRegistry();
  const engine = createEngine({ store, bus, llm, connectors, config });
  engine.recover(store.getDefaultTenant().id);

  const app = buildApp({ store, bus, engine, connectors, llm, config });
  await app.listen({ port: config.port, host: '0.0.0.0' });

  const modo =
    config.llmMode === 'live'
      ? `real (CEO: ${config.models.opus}, agentes: ${config.models.sonnet})`
      : 'simulacion (sin ANTHROPIC_API_KEY o LLM_MODE=mock)';
  console.log(`Agentic Office escuchando en http://localhost:${config.port} | modo LLM: ${modo}`);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} recibido, cerrando...`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});
