import { describe, expect, it } from 'vitest';
import type { ActionDef, Agent, Task } from '@agentic-office/shared';
import type { AgentContext, Config } from '../src/contracts';
import { createMockProvider, detectComplexity, mockPlan, normalize } from '../src/llm/mock';

const config: Config = {
  port: 0,
  dbPath: ':memory:',
  llmMode: 'mock',
  models: { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5' },
  mockStepDelayMs: 0,
};

function agent(key: string, area: string, description: string, role: Agent['role'] = 'area'): Agent {
  return {
    id: `id-${key}`, tenantId: 't1', key, name: `Agente ${area}`, role, area, description,
    defaultModel: 'sonnet', color: '#888888', enabled: true, createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function action(agentId: string, key: string, name: string, description: string, params: ActionDef['params'] = []): ActionDef {
  return {
    id: `act-${key}`, tenantId: 't1', agentId, key, name, description, params, connector: 'internal',
    connectorConfig: {}, requiresApproval: false, enabled: true, createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const soporte = agent('soporte', 'Soporte', 'Atiende consultas y casos de clientes.');
const marketing = agent('marketing', 'Marketing', 'Planifica campanas y contenido para redes sociales.');
const conta = agent('contabilidad', 'Contabilidad', 'Lleva las cuentas, emite documentos tributarios.');
const comunic = agent('comunicaciones', 'Comunicaciones', 'Redacta comunicados internos y externos.');
const ventas = agent('ventas', 'Ventas', 'Gestiona oportunidades comerciales.');
const rrhh = agent('rrhh', 'RR. HH.', 'Seleccion y gestion de personas.');
const ceo = agent('ceo', 'Direccion', 'Dirige al equipo.', 'ceo');

const team: AgentContext[] = [
  {
    agent: soporte,
    actions: [
      action(soporte.id, 'crear_ticket', 'Crear ticket', 'Abre un ticket de soporte para un cliente.', [
        { name: 'asunto', type: 'string', description: 'Asunto del ticket', required: true },
        { name: 'prioridad', type: 'string', description: 'Prioridad', required: true, enum: ['alta', 'media', 'baja'] },
      ]),
      action(soporte.id, 'responder_cliente', 'Responder cliente', 'Envia una respuesta al cliente.', [
        { name: 'mensaje', type: 'string', description: 'Texto', required: true },
        { name: 'urgente', type: 'boolean', description: 'Urgente', required: false },
      ]),
      action(soporte.id, 'cerrar_caso', 'Cerrar caso', 'Cierra un caso resuelto.'),
    ],
  },
  { agent: marketing, actions: [action(marketing.id, 'programar_post', 'Programar post', 'Programa una publicacion en redes.')] },
  {
    agent: conta,
    actions: [
      action(conta.id, 'emitir_factura', 'Emitir factura', 'Emite una factura.', [
        { name: 'monto', type: 'number', description: 'Monto', required: true },
      ]),
    ],
  },
  { agent: comunic, actions: [] },
  { agent: ventas, actions: [] },
  { agent: rrhh, actions: [] },
];

function task(agentId: string, instructions: string): Task {
  return {
    id: 'task-1', tenantId: 't1', parentId: 'root', agentId, title: 'Subtarea', instructions,
    complexity: 'simple', model: 'mock', status: 'running', result: null, error: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('mock LLM - plan', () => {
  it('normaliza tildes y mayusculas', () => {
    expect(normalize('Campaña ÁRBOL')).toBe('campana arbol');
  });

  it('delega por sinonimos a varias areas', async () => {
    const llm = createMockProvider(config);
    const plan = await llm.plan({
      model: 'mock', ceo, team,
      request: 'Un cliente reclamó por una factura duplicada; preparen también una campaña en redes.',
    });
    const keys = plan.subtasks.map((s) => s.agentKey).sort();
    expect(keys).toEqual(['contabilidad', 'marketing', 'soporte']);
    expect(plan.directAnswer).toBeNull();
  });

  it('reconoce comunicaciones, ventas y rrhh', () => {
    expect(mockPlan(team, 'Redacta un comunicado de prensa').subtasks.map((s) => s.agentKey)).toEqual(['comunicaciones']);
    expect(mockPlan(team, 'Envia la cotizacion al lead nuevo').subtasks.map((s) => s.agentKey)).toEqual(['ventas']);
    expect(mockPlan(team, 'Hay que contratar a un disenador y revisar vacaciones').subtasks.map((s) => s.agentKey)).toEqual(['rrhh']);
  });

  it('responde directo si no hay coincidencias', () => {
    const plan = mockPlan(team, 'Hola, ¿qué tal?');
    expect(plan.subtasks).toHaveLength(0);
    expect(plan.directAnswer).toBeTruthy();
  });

  it('marca complex segun palabras clave o largo', () => {
    expect(detectComplexity('Analiza los reclamos del mes')).toBe('complex');
    expect(detectComplexity('Arma un plan de marketing')).toBe('complex');
    expect(detectComplexity('Emite la factura 123')).toBe('simple');
    expect(detectComplexity('factura '.repeat(50))).toBe('complex');
    expect(mockPlan(team, 'Analiza la estrategia de redes').subtasks[0]?.complexity).toBe('complex');
  });

  it('es determinista', () => {
    const req = 'Un cliente pide la factura y una cotizacion';
    expect(mockPlan(team, req)).toEqual(mockPlan(team, req));
  });
});

describe('mock LLM - step', () => {
  it('llama acciones afines con parametros validos y luego resume', async () => {
    const llm = createMockProvider(config);
    const ctx = team[0]!;
    const conv0 = llm.startConversation({ ctx, task: task(soporte.id, 'Crear un ticket por el reclamo del cliente'), rootRequest: 'x' });
    const s1 = await llm.step({ model: 'mock', ctx, conversation: conv0 });
    expect(s1.finalText).toBeNull();
    expect(s1.toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(s1.toolCalls.length).toBeLessThanOrEqual(2);
    const first = s1.toolCalls[0]!;
    expect(first.name).toBe('crear_ticket');
    expect(first.input.prioridad).toBe('alta');
    expect(typeof first.input.asunto).toBe('string');

    // Determinismo
    const again = await llm.step({ model: 'mock', ctx, conversation: conv0 });
    expect(again).toEqual(s1);

    const results = s1.toolCalls.map((c, i) => ({
      toolCallId: c.id,
      content: i === 0 ? '{"ok":true}' : 'Rechazada por el usuario: no corresponde',
      isError: i !== 0,
    }));
    const conv1 = llm.addToolResults(s1.conversation, results);
    const s2 = await llm.step({ model: 'mock', ctx, conversation: conv1 });
    expect(s2.toolCalls).toHaveLength(0);
    expect(s2.finalText).toContain('Crear ticket');
    if (s1.toolCalls.length > 1) expect(s2.finalText).toContain('Rechazadas');
  });

  it('genera number y boolean', async () => {
    const llm = createMockProvider(config);
    const ctx = team[2]!;
    const s = await llm.step({
      model: 'mock', ctx,
      conversation: llm.startConversation({ ctx, task: task(conta.id, 'Emitir factura'), rootRequest: 'x' }),
    });
    expect(s.toolCalls[0]?.input).toEqual({ monto: 1 });
  });

  it('sin acciones responde texto', async () => {
    const llm = createMockProvider(config);
    const ctx = team[3]!;
    const s = await llm.step({
      model: 'mock', ctx,
      conversation: llm.startConversation({ ctx, task: task(comunic.id, 'Redacta un comunicado'), rootRequest: 'x' }),
    });
    expect(s.toolCalls).toHaveLength(0);
    expect(s.finalText).toBeTruthy();
  });

  it('synthesize escribe una linea por area', async () => {
    const llm = createMockProvider(config);
    const text = await llm.synthesize({
      model: 'mock', ceo, request: 'algo',
      results: [
        { agent: soporte, task: { ...task(soporte.id, 'a'), status: 'completed', result: 'Ticket creado' } },
        { agent: conta, task: { ...task(conta.id, 'b'), status: 'failed', error: 'Conector caido' } },
      ],
    });
    expect(text).toContain('- Soporte: completado. Ticket creado');
    expect(text).toContain('- Contabilidad: fallo. Conector caido');
  });
});
