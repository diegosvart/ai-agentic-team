/**
 * Webhook generico: envia la accion como JSON a una URL del cliente.
 * Proteccion SSRF: solo http/https, sin redirecciones, sin destinos locales, privados o
 * reservados (salvo WEBHOOK_ALLOW_PRIVATE=1, pensado para tests y desarrollo) y conectando
 * siempre a la IP ya validada (sin segunda resolucion DNS).
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { Connector, ConnectorResult } from '../contracts';

const TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 4000;
/** Bytes maximos que se leen de la respuesta (holgura para UTF-8 multibyte). */
const MAX_BODY_BYTES = MAX_BODY_CHARS * 4;
const METHODS = ['POST', 'PUT'] as const;
type Method = (typeof METHODS)[number];

function allowPrivate(): boolean {
  return process.env.WEBHOOK_ALLOW_PRIVATE === '1';
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

/** Rangos IPv4 no publicos (RFC 6890 y relacionados). */
const BLOCKED_V4: Array<[base: string, bits: number]> = [
  ['0.0.0.0', 8], // "esta red"
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // enlace local / metadata de nube
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // asignaciones IETF
  ['192.0.2.0', 24], // documentacion
  ['192.88.99.0', 24], // relay 6to4
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentacion
  ['203.0.113.0', 24], // documentacion
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada + broadcast
];

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Convierte una IPv6 valida en sus 8 grupos de 16 bits (admite IPv4 punteada al final). */
function parseIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  const tail: number[] = [];
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted?.[1]) {
    const n = ipv4ToInt(dotted[1]);
    tail.push(n >>> 16, n & 0xffff);
    s = s.slice(0, -dotted[1].length);
    if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
  }
  const [left = '', right] = s.split('::');
  const toGroups = (part: string) => (part ? part.split(':').map((h) => Number.parseInt(h, 16)) : []);
  const head = toGroups(left);
  const rest = [...toGroups(right ?? ''), ...tail];
  const groups =
    right === undefined
      ? [...head, ...tail]
      : [...head, ...new Array<number>(8 - head.length - rest.length).fill(0), ...rest];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const v4From = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;

function isBlockedV6(ip: string): boolean {
  const g = parseIPv6(ip);
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  const zero64 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;
  // ::ffff:a.b.c.d (mapeada), ::a.b.c.d (compatible; :: y ::1 caen en 0.0.0.0/8) y
  // ::ffff:0:a.b.c.d (SIIT): el destino real es la IPv4 embebida.
  if (zero64 && ((g4 === 0 && (g5 === 0xffff || g5 === 0)) || (g4 === 0xffff && g5 === 0))) {
    return isBlockedV4(v4From(g6, g7));
  }
  // NAT64 64:ff9b::/96: el destino real es la IPv4 embebida.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isBlockedV4(v4From(g6, g7));
  // 6to4 2002::/16: IPv4 en los grupos 1-2.
  if (g0 === 0x2002) return isBlockedV4(v4From(g1, g2));
  // Solo se admite unicast global (2000::/3)...
  if ((g0 & 0xe000) !== 0x2000) return true;
  // ...excepto Teredo (2001::/32, IPv4 ofuscada), ORCHID/benchmarking (2001:0010::/28, 2001:0002::/48)
  // y documentacion (2001:db8::/32, 3fff::/20).
  if (g0 === 0x2001 && (g1 === 0 || g1 === 0x0db8 || (g1 & 0xfff0) === 0x0010 || g1 === 0x0002)) return true;
  if (g0 === 0x3fff && (g1 & 0xf000) === 0) return true;
  return false;
}

/**
 * true si la IP (v4 o v6) no es unicast publica: loopback, privada, enlace local, reservada,
 * multicast, documentacion o una IPv6 que embebe una IPv4 de esos rangos (mapeada, compatible,
 * NAT64, 6to4). Las cadenas que no son IP se consideran bloqueadas.
 */
export function isPrivateAddress(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '');
  const version = isIP(clean);
  if (version === 4) return isBlockedV4(clean);
  if (version === 6) return isBlockedV6(clean);
  return true;
}

function isLocalHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal');
}

function readConfig(config: Record<string, unknown>) {
  const url = typeof config.url === 'string' ? config.url.trim() : '';
  const rawMethod = typeof config.method === 'string' ? config.method.trim().toUpperCase() : '';
  const method = (rawMethod || 'POST') as Method;
  const headersJson = typeof config.headersJson === 'string' ? config.headersJson.trim() : '';
  return { url, method, headersJson };
}

function parseHeaders(headersJson: string): { headers: Record<string, string>; error?: string } {
  if (!headersJson) return { headers: {} };
  let data: unknown;
  try {
    data = JSON.parse(headersJson);
  } catch {
    return { headers: {}, error: 'Las cabeceras deben ser un JSON valido, p. ej. {"Authorization": "Bearer ..."}.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { headers: {}, error: 'Las cabeceras deben ser un objeto JSON.' };
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v !== 'string') return { headers: {}, error: `La cabecera "${k}" debe ser texto.` };
    headers[k] = v;
  }
  return { headers };
}

/** Validacion sintactica de la URL (sin DNS). Devuelve el error o null. */
function checkUrlSyntax(raw: string): { url?: URL; error?: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'La URL no es valida.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'La URL debe usar http o https.' };
  }
  if (url.username || url.password) {
    return { error: 'La URL no debe incluir usuario ni contrasena; usa las cabeceras.' };
  }
  if (!allowPrivate()) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isLocalHostname(host) || (isIP(host) && isPrivateAddress(host))) {
      return { error: 'No se permiten destinos locales o de red privada.' };
    }
  }
  return { url };
}

const PRIVATE_DEST = 'No se permiten destinos locales o de red privada.';

/** Resolutor DNS inyectable (tests). Firma de dns.lookup con { all: true }. */
export type Resolver = (host: string) => Promise<LookupAddress[]>;

const systemResolver: Resolver = (host) =>
  new Promise((resolve, reject) =>
    dnsLookup(host, { all: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
  );

class BlockedDestinationError extends Error {}

/**
 * lookup para la conexion: resuelve UNA vez, valida todas las direcciones y entrega a la
 * conexion exactamente las validadas. Asi no hay una segunda resolucion que un DNS con TTL 0
 * pueda cambiar entre la comprobacion y el connect (DNS rebinding).
 */
export function createSafeLookup(resolver: Resolver): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname).then(
      (addrs) => {
        const family = typeof options === 'object' && options ? options.family : undefined;
        const wanted = family === 4 || family === 6 ? addrs.filter((a) => a.family === family) : addrs;
        if (wanted.length === 0) {
          callback(Object.assign(new Error(`No se pudo resolver el host ${hostname}.`), { code: 'ENOTFOUND' }), '', 0);
          return;
        }
        if (!allowPrivate() && wanted.some((a) => isPrivateAddress(a.address))) {
          callback(new BlockedDestinationError('El host resuelve a una direccion privada; destino no permitido.'), '', 0);
          return;
        }
        if (typeof options === 'object' && options?.all) {
          (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, wanted);
        } else {
          const first = wanted[0] as LookupAddress;
          callback(null, first.address, first.family);
        }
      },
      (err: unknown) => callback(err as NodeJS.ErrnoException, '', 0),
    );
  };
}

interface HttpResult {
  status: number;
  text: string;
}

/** Peticion HTTP con lookup validado, sin seguir redirecciones y con limite de bytes de respuesta. */
function sendRequest(url: URL, method: Method, headers: Record<string, string>, body: string, resolver: Resolver): Promise<HttpResult> {
  const doRequest = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const req = doRequest(
      url,
      {
        method,
        headers: { ...headers, 'content-length': Buffer.byteLength(body).toString() },
        lookup: createSafeLookup(resolver),
        signal,
        // Sin keep-alive: cada envio resuelve y valida de nuevo.
        agent: false,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => {
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8').slice(0, MAX_BODY_CHARS) });
        };
        res.on('data', (chunk: Buffer) => {
          const room = MAX_BODY_BYTES - size;
          if (room > 0) chunks.push(room >= chunk.length ? chunk : chunk.subarray(0, room));
          size += chunk.length;
          // Se deja de leer en cuanto se supera el limite: no se acumula el resto en memoria.
          if (size >= MAX_BODY_BYTES) {
            res.destroy();
            finish();
          }
        });
        res.on('end', finish);
        res.on('error', () => finish());
        res.on('aborted', finish);
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function fail(error: string, output: unknown = null): ConnectorResult {
  return { ok: false, simulated: false, output, error };
}

export function createWebhookConnector(opts: { resolver?: Resolver } = {}): Connector {
  const resolver = opts.resolver ?? systemResolver;
  return {
    info: {
      key: 'webhook',
      name: 'Webhook HTTP',
      description:
        'Envia la accion como JSON a una URL (n8n, Zapier, Make o tu propio backend). Sin URL funciona en modo prueba y no envia nada.',
      maturity: 'ready',
      configFields: [
        { name: 'url', label: 'URL de destino', type: 'string', required: false, placeholder: 'https://hooks.ejemplo.com/accion' },
        { name: 'method', label: 'Metodo', type: 'select', required: true, options: [...METHODS] },
        { name: 'headersJson', label: 'Cabeceras (JSON, opcional)', type: 'string', required: false, placeholder: '{"Authorization": "Bearer ..."}' },
      ],
    },

    validateConfig(config) {
      const errors: string[] = [];
      const { url, method, headersJson } = readConfig(config);
      if (!METHODS.includes(method)) errors.push('El metodo debe ser POST o PUT.');
      if (url) {
        const { error } = checkUrlSyntax(url);
        if (error) errors.push(error);
      }
      const { error: headersError } = parseHeaders(headersJson);
      if (headersError) errors.push(headersError);
      return errors;
    },

    async execute({ action, params, agent, task }) {
      const { url, method, headersJson } = readConfig(action.connectorConfig);
      const body = { action: action.key, params, agent: { key: agent.key, name: agent.name }, taskId: task.id };

      if (!url) {
        return {
          ok: true,
          simulated: true,
          output: { mensaje: 'Modo prueba: no hay URL configurada, no se envio nada.', metodo: method, cuerpo: body },
        };
      }
      if (!METHODS.includes(method)) return fail('El metodo debe ser POST o PUT.');
      const { headers, error: headersError } = parseHeaders(headersJson);
      if (headersError) return fail(headersError);
      const { url: parsed, error: urlError } = checkUrlSyntax(url);
      if (!parsed) return fail(urlError ?? 'La URL no es valida.');

      let status: number;
      let text: string;
      try {
        ({ status, text } = await sendRequest(
          parsed,
          method,
          { 'content-type': 'application/json', 'user-agent': 'agentic-office-webhook/0.1', ...headers },
          JSON.stringify(body),
          resolver,
        ));
      } catch (err) {
        if (err instanceof BlockedDestinationError) return fail(err.message);
        const name = err instanceof Error ? err.name : '';
        const code = (err as { code?: unknown } | null)?.code;
        if (name === 'TimeoutError' || name === 'AbortError' || code === 'ABORT_ERR') {
          return fail(`El webhook no respondio en ${TIMEOUT_MS / 1000} s.`);
        }
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return fail(`No se pudo resolver el host ${parsed.hostname}.`);
        // No se incluye la URL completa ni las cabeceras para no filtrar secretos.
        return fail(`No se pudo conectar con el webhook (${parsed.host}).`);
      }

      let data: unknown = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // respuesta no JSON: se devuelve como texto
      }
      const output = { status, respuesta: data };
      if (status < 200 || status >= 300) {
        return fail(`El webhook respondio con estado ${status}.`, output);
      }
      return { ok: true, simulated: false, output };
    },
  };
}
