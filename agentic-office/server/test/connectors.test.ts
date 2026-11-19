import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ActionDef, Agent, Task } from '@agentic-office/shared';
import { createConnectorRegistry, createWebhookConnector, internalReference, isPrivateAddress } from '../src/connectors';
import { actionToTool, stripNullParams } from '../src/llm/anthropic';

const agent: Agent = {
  id: 'a1', tenantId: 't1', key: 'soporte', name: 'Sofia', role: 'area', area: 'Soporte', description: 'x',
  defaultModel: 'sonnet', color: '#000000', enabled: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const task: Task = {
  id: 'task-42', tenantId: 't1', parentId: 'r', agentId: 'a1', title: 't', instructions: 'i', complexity: 'simple',
  model: 'mock', status: 'running', result: null, error: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
function action(connector: string, connectorConfig: Record<string, unknown>, extra: Partial<ActionDef> = {}): ActionDef {
  return {
    id: 'act1', tenantId: 't1', agentId: 'a1', key: 'crear_ticket', name: 'Crear ticket', description: 'Abre un ticket.',
    params: [], connector, connectorConfig, requiresApproval: false, enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z', ...extra,
  };
}

const registry = createConnectorRegistry();

describe('registro', () => {
  it('lista conectores ready y stub', () => {
    const list = registry.list();
    expect(list.map((c) => c.key)).toEqual(['internal', 'webhook', 'whatsapp', 'voice_tts', 'email']);
    expect(list.filter((c) => c.maturity === 'stub').map((c) => c.key)).toEqual(['whatsapp', 'voice_tts', 'email']);
    expect(registry.get('nope')).toBeNull();
  });

  it('stubs validan su configuracion y simulan', async () => {
    const wa = registry.get('whatsapp')!;
    expect(wa.validateConfig({})).not.toHaveLength(0);
    expect(wa.validateConfig({ fromNumber: '+56912345678' })).toEqual([]);
    expect(registry.get('voice_tts')!.validateConfig({ voice: 'x', language: 'es-CL' })).toHaveLength(1);
    expect(registry.get('email')!.validateConfig({ fromAddress: 'equipo@empresa.com' })).toEqual([]);
    const r = await wa.execute({ action: action('whatsapp', { fromNumber: '+56912345678' }), params: { a: 1 }, agent, task });
    expect(r).toMatchObject({ ok: true, simulated: true });
  });
});

describe('conector interno', () => {
  it('simula con referencia determinista', async () => {
    const c = registry.get('internal')!;
    const r1 = await c.execute({ action: action('internal', {}), params: { x: 1 }, agent, task });
    const r2 = await c.execute({ action: action('internal', {}), params: { x: 1 }, agent, task });
    expect(r1).toEqual(r2);
    expect(r1.ok).toBe(true);
    expect(r1.simulated).toBe(true);
    expect((r1.output as Record<string, unknown>).referencia).toBe(internalReference('task-42', 'crear_ticket'));
  });
});

describe('webhook', () => {
  const webhook = registry.get('webhook')!;
  let server: Server;
  let base = '';
  const received: Array<{ method?: string; body: unknown; auth?: string }> = [];
  let bigBytesSent = 0;
  let bigClosed = false;

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
    });

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const body = await readBody(req);
      received.push({ method: req.method, body: body ? JSON.parse(body) : null, auth: req.headers.authorization });
      if (req.url === '/big') {
        // Respuesta hostil: envia sin parar hasta que el cliente corta.
        res.writeHead(200, { 'content-type': 'text/plain' });
        const chunk = Buffer.alloc(64 * 1024, 'a');
        const pump = () => {
          while (!res.destroyed && bigBytesSent < 256 * 1024 * 1024) {
            bigBytesSent += chunk.length;
            if (!res.write(chunk)) return void res.once('drain', pump);
          }
          res.end();
        };
        res.on('close', () => (bigClosed = true));
        pump();
        return;
      }
      if (req.url === '/fail') {
        res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"boom"}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"recibido":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  afterEach(() => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE;
  });

  it('dry-run sin URL', async () => {
    const r = await webhook.execute({ action: action('webhook', { url: '', method: 'POST' }), params: { a: 1 }, agent, task });
    expect(r.ok).toBe(true);
    expect(r.simulated).toBe(true);
    expect((r.output as { cuerpo: unknown }).cuerpo).toEqual({
      action: 'crear_ticket', params: { a: 1 }, agent: { key: 'soporte', name: 'Sofia' }, taskId: 'task-42',
    });
  });

  it('envia al servidor local con WEBHOOK_ALLOW_PRIVATE=1', async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    const cfg = { url: `${base}/ok`, method: 'PUT', headersJson: '{"Authorization":"Bearer secreto"}' };
    expect(webhook.validateConfig(cfg)).toEqual([]);
    const r = await webhook.execute({ action: action('webhook', cfg), params: { prioridad: 'alta' }, agent, task });
    expect(r).toMatchObject({ ok: true, simulated: false, output: { status: 200, respuesta: { recibido: true } } });
    const last = received[received.length - 1]!;
    expect(last.method).toBe('PUT');
    expect(last.auth).toBe('Bearer secreto');
    expect(last.body).toEqual({
      action: 'crear_ticket', params: { prioridad: 'alta' }, agent: { key: 'soporte', name: 'Sofia' }, taskId: 'task-42',
    });
  });

  it('respuesta no 2xx -> ok false', async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    const r = await webhook.execute({ action: action('webhook', { url: `${base}/fail`, method: 'POST' }), params: {}, agent, task });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('500');
  });

  it('bloquea destinos privados sin la variable', async () => {
    const count = received.length;
    const r = await webhook.execute({ action: action('webhook', { url: `${base}/ok`, method: 'POST' }), params: {}, agent, task });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/privad/);
    expect(received.length).toBe(count);
    for (const url of ['http://localhost/x', 'http://10.1.2.3/', 'http://192.168.0.5/', 'http://169.254.169.254/', 'http://[::1]/']) {
      expect(webhook.validateConfig({ url, method: 'POST' }), url).not.toHaveLength(0);
    }
  });

  it('bloquea IPv6 con IPv4 embebida (forma normalizada por URL) y rangos reservados', () => {
    for (const url of [
      'http://[::ffff:127.0.0.1]:8080/x',
      'http://[::ffff:169.254.169.254]/latest/meta-data',
      'http://[::ffff:10.0.0.1]/',
      'http://[::127.0.0.1]/',
      'http://[64:ff9b::7f00:1]/',
      'http://[2002:7f00:1::1]/',
      'http://[2001:db8::1]/',
      'http://[ff02::1]/',
      'http://198.18.0.1/',
      'http://192.0.0.8/',
      'http://224.0.0.1/',
      'http://255.255.255.255/',
    ]) {
      expect(webhook.validateConfig({ url, method: 'POST' }), url).not.toHaveLength(0);
    }
    expect(webhook.validateConfig({ url: 'http://[2606:4700::1111]/h', method: 'POST' })).toEqual([]);
  });

  it('conecta a la IP validada: una sola resolucion DNS (sin rebinding)', async () => {
    const port = (server.address() as AddressInfo).port;
    let calls = 0;
    // Primera respuesta privada: debe bloquearse sin llegar a conectar.
    const rebinding = createWebhookConnector({
      resolver: async () => (++calls === 1 ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '8.8.8.8', family: 4 }]),
    });
    const count = received.length;
    const r = await rebinding.execute({
      action: action('webhook', { url: `http://rebind.example:${port}/ok`, method: 'POST' }), params: {}, agent, task,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/privad/);
    expect(calls).toBe(1);
    expect(received.length).toBe(count);

    // La conexion usa exactamente la direccion que entrega el resolutor validado.
    process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    let calls2 = 0;
    const pinned = createWebhookConnector({ resolver: async () => (calls2++, [{ address: '127.0.0.1', family: 4 }]) });
    const ok = await pinned.execute({
      action: action('webhook', { url: `http://no-existe.invalid:${port}/ok`, method: 'POST' }), params: {}, agent, task,
    });
    expect(ok).toMatchObject({ ok: true, output: { status: 200 } });
    expect(calls2).toBe(1);
  });

  it('corta la lectura de respuestas enormes sin cargarlas enteras', async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    const started = Date.now();
    const r = await webhook.execute({ action: action('webhook', { url: `${base}/big`, method: 'POST' }), params: {}, agent, task });
    expect(r.ok).toBe(true);
    expect(((r.output as { respuesta: string }).respuesta).length).toBe(4000);
    expect(Date.now() - started).toBeLessThan(5000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bigClosed).toBe(true);
    expect(bigBytesSent).toBeLessThan(32 * 1024 * 1024);
  });

  it('valida protocolo, metodo y cabeceras', () => {
    expect(webhook.validateConfig({ url: 'ftp://ejemplo.com', method: 'POST' })).toHaveLength(1);
    expect(webhook.validateConfig({ url: 'https://ejemplo.com', method: 'GET' })).toHaveLength(1);
    expect(webhook.validateConfig({ url: 'https://ejemplo.com', method: 'POST', headersJson: '{mal' })).toHaveLength(1);
    expect(webhook.validateConfig({ url: 'https://ejemplo.com/h', method: 'POST' })).toEqual([]);
  });

  it('clasifica IPs privadas', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1', '169.254.1.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fd00::1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of [
      '::ffff:7f00:1', '::ffff:a00:1', '::ffff:a9fe:a9fe', '::7f00:1', '::', '::ffff:0:7f00:1', '64:ff9b::a9fe:a9fe',
      '2002:a9fe:a9fe::1', '2001::1', '2001:db8::1', 'fec0::1', 'ff02::1', '100::1', '198.18.0.1', '198.19.255.255',
      '192.0.0.1', '192.0.2.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', 'no-es-ip',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700::1111', '198.20.0.1', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe('ActionDef -> herramienta', () => {
  it('genera schema estricto con opcionales anulables', () => {
    const tool = actionToTool(
      action('internal', {}, {
        params: [
          { name: 'asunto', type: 'string', description: 'Asunto', required: true },
          { name: 'prioridad', type: 'string', description: 'Prioridad', required: false, enum: ['alta', 'baja'] },
          { name: 'monto', type: 'number', description: 'Monto', required: false },
          { name: 'urgente', type: 'boolean', description: 'Urgente', required: true },
        ],
      }),
    );
    expect(tool.name).toBe('crear_ticket');
    expect(tool.strict).toBe(true);
    expect(tool.input_schema).toEqual({
      type: 'object',
      properties: {
        asunto: { type: 'string', description: 'Asunto' },
        prioridad: { type: ['string', 'null'], description: 'Prioridad', enum: ['alta', 'baja', null] },
        monto: { type: ['number', 'null'], description: 'Monto' },
        urgente: { type: 'boolean', description: 'Urgente' },
      },
      required: ['asunto', 'prioridad', 'monto', 'urgente'],
      additionalProperties: false,
    });
  });

  it('menciona la aprobacion y elimina nulls del input', () => {
    expect(actionToTool(action('internal', {}, { requiresApproval: true })).description).toContain('aprobacion');
    expect(stripNullParams({ a: 1, b: null, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });
});
