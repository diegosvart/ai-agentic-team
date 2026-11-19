import type { Config, LLMProvider } from '../contracts';
import { createAnthropicProvider } from './anthropic';
import { createMockProvider } from './mock';

/** 'live' usa Claude (ANTHROPIC_API_KEY del entorno); 'mock' simula sin red. */
export function createLLMProvider(config: Config): LLMProvider {
  return config.llmMode === 'live' ? createAnthropicProvider(config) : createMockProvider(config);
}

export { actionToTool, stripNullParams, planSchema } from './anthropic';
export { createMockProvider } from './mock';
