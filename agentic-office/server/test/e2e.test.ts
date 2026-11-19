/**
 * Prueba de extremo a extremo con los modulos REALES ensamblados como en src/index.ts:
 * store SQLite en memoria + plantilla, bus de eventos, LLM mock, registro de conectores,
 * motor y API Fastify. Todo se recorre por HTTP con app.inject.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ActionDef, ActionRun, OfficeEvent, StateResponse, TaskTree } from '@agentic-office/shared';
import { loadConfig } from '../src/config';
import { createStore } from '../src/store/index';
import { createEventBus } from '../src/events/index';
import { createLLMProvider } from '../src/llm/index';
import { createConnectorRegistry } from '../src/connectors/index';
import { createEngine } from '../src/engine/index';
import { buildApp } from '../src/api/index';
import type { Engine, EventBus, Store } from '../src/contracts';

let app: FastifyInstance;
let engine: Engine;
let store: Store;
let bus: EventBus;
let events: OfficeEvent[];

beforeEach(async () => {
  const config = { ...loadConfig({ LLM_MODE: 'mock' }), dbPath: ':memory:', mockStepDelayMs: 0 };
  store = createStore(':memory:');
  store.init();
  bus = createEventBus();
  const llm = createLLMProvider(config);
  const connectors = createConnectorRegistry();
  engine = createEngine({ store, bus, llm, connectors, config });
  engine.recover(store.getDefaultTenant().id);
  app = buildApp({ store, bus, engine, connectors, llm, config });
  await app.ready();
  events = [];
  bus.subscribe(store.getDefaultTenant().id, (e) => events.push(e));
});

afterEach(async () => {
  await engine.idle();
  await app.close();
});

async function getState(): Promise<StateResponse> {
  const res = await app.inject({ method: 'GET', url: '/api/state' });
  expect(res.statusCode).toBe(200);
  return res.json() as StateResponse;
}

async function submit(text: string): Promise<TaskTree> {
  const res = await app.inject({ method: 'POST', url: '/api/requests', payload: { text } });
  expect(res.statusCode).toBe(201);
  const tree = res.json() as TaskTree;
  await engine.idle();
  return tree;
}

async function tree(id: string): Promise<TaskTree> {
  const res = await app.inject({ method: 'GET', url: `/api/tasks/${id}` });
  expect(res.statusCode).toBe(200);
  return res.json() as TaskTree;
}

async function approvals(): Promise<ActionRun[]> {
  const res = await app.inject({ method: 'GET', url: '/api/approvals' });
  expect(res.statusCode).toBe(200);
  return res.json() as ActionRun[];
}

const MULTI_AREA = 'Un cliente reclama por una factura duplicada: respondele al cliente y revisa el pago de la factura';

describe('e2e con modulos reales', () => {
  it('health informa modo simulacion', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toMatchObject({ ok: true, llmMode: 'mock' });
  });

  it('solicitud multi-area -> subtareas -> aprobacion -> aprobar -> raiz completada', async () => {
    const state = await getState();
    const keyOf = (id: string) => state.agents.find((a) => a.id === id)?.key;

    const created = await submit(MULTI_AREA);
    let t = await tree(created.task.id);

    // Subtareas para los agentes correctos.
    const keys = t.children.map((c) => keyOf(c.agentId)).sort();
    expect(keys).toEqual(['contabilidad', 'soporte']);
    expect(events.some((e) => e.type === 'delegation')).toBe(true);

    // Al menos una accion quedo pendiente de aprobacion y la raiz espera.
    const pending = await approvals();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((r) => r.status === 'pending_approval')).toBe(true);
    expect(t.task.status).toBe('waiting_approval');
    const waitingChildren = t.children.filter((c) => c.status === 'waiting_approval');
    expect(waitingChildren.length).toBeGreaterThan(0);

    for (const run of pending) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/action-runs/${run.id}/approve`,
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as ActionRun).status).toBe('succeeded');
    }
    await engine.idle();

    t = await tree(created.task.id);
    expect(t.task.status).toBe('completed');
    expect(t.task.result).toBeTruthy();
    expect(t.task.result).toContain('Resumen del CEO');
    expect(t.children.every((c) => c.status === 'completed')).toBe(true);
    expect(await approvals()).toHaveLength(0);
    // Auditoria: todas las ejecuciones terminaron bien.
    expect(t.actionRuns.length).toBeGreaterThan(0);
    expect(t.actionRuns.every((r) => r.status === 'succeeded')).toBe(true);

    // Una segunda resolucion de la misma accion es un conflicto.
    const again = await app.inject({ method: 'POST', url: `/api/action-runs/${pending[0]!.id}/approve`, payload: {} });
    expect(again.statusCode).toBe(409);
  });

  it('rechazo: la nota llega al agente y la raiz se completa informandolo', async () => {
    const created = await submit(MULTI_AREA);
    const pending = await approvals();
    expect(pending.length).toBeGreaterThan(0);

    for (const run of pending) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/action-runs/${run.id}/reject`,
        payload: { note: 'No enviar todavia' },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as ActionRun).status).toBe('rejected');
    }
    await engine.idle();

    const t = await tree(created.task.id);
    expect(t.task.status).toBe('completed');
    const rejectedRuns = t.actionRuns.filter((r) => r.status === 'rejected');
    expect(rejectedRuns.length).toBe(pending.length);
    const affected = t.children.filter((c) => rejectedRuns.some((r) => r.taskId === c.id));
    expect(affected.length).toBeGreaterThan(0);
    for (const child of affected) {
      expect(child.status).toBe('completed');
      expect(child.result).toMatch(/rechazad/i);
      expect(child.result).toContain('No enviar todavia');
    }
    expect(t.task.result).toMatch(/rechazad/i);
  });

  it('una accion creada por la API la usa el agente en la siguiente solicitud', async () => {
    const state = await getState();
    const ventas = state.agents.find((a) => a.key === 'ventas')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      payload: {
        agentId: ventas.id,
        key: 'enviar_muestra_gratis',
        name: 'Enviar muestra gratis',
        description: 'Envia una muestra gratuita del producto a un lead interesado.',
        params: [
          { name: 'lead', type: 'string', description: 'Nombre del lead', required: true },
          { name: 'unidades', type: 'number', description: 'Unidades a enviar', required: false },
        ],
        connector: 'internal',
      },
    });
    expect(res.statusCode).toBe(201);
    const action = res.json() as ActionDef;
    expect(events.some((e) => e.type === 'config.changed')).toBe(true);

    const created = await submit('Envia una muestra gratuita del producto al lead de ventas');
    const t = await tree(created.task.id);
    expect(t.children.map((c) => c.agentId)).toContain(ventas.id);
    const run = t.actionRuns.find((r) => r.actionId === action.id);
    expect(run).toBeDefined();
    expect(run!.status).toBe('succeeded');
    expect(run!.params).toHaveProperty('lead');
    expect(t.task.status).toBe('completed');
  });
});
