import type { Config } from './contracts';

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function str(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  return v ? v : fallback;
}

/** El frontend en desarrollo (Vite). En produccion el servidor sirve la web desde su mismo origen. */
export const DEFAULT_CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const hasKey = Boolean(env.ANTHROPIC_API_KEY?.trim());
  const forcedMock = env.LLM_MODE?.trim().toLowerCase() === 'mock';
  return {
    port: int(env.PORT, 8787),
    dbPath: str(env.DB_PATH, './data/agentic-office.db'),
    llmMode: hasKey && !forcedMock ? 'live' : 'mock',
    models: {
      opus: str(env.MODEL_OPUS, 'claude-opus-5-5'),
      sonnet: str(env.MODEL_SONNET, 'claude-sonnet-5-5'),
    },
    mockStepDelayMs: int(env.MOCK_STEP_DELAY_MS, 900),
    corsOrigins: str(env.CORS_ORIGINS, DEFAULT_CORS_ORIGINS)
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  };
}
