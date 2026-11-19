# Guia de integraciones

Como convertir un conector stub (WhatsApp, voz/TTS, email) en uno real, y que falta para multi-tenant.

## 1. Anatomia de un conector

Un conector implementa `Connector` (`server/src/contracts.ts`):

- `info`: clave, nombre, descripcion, `maturity` (`ready` o `stub`) y `configFields`. La UI genera
  el formulario de la accion a partir de `configFields`.
- `validateConfig(config)`: se llama al crear o editar una accion; devuelve mensajes de error (vacio = valido).
- `execute({ action, params, agent, task })`: hace el trabajo y devuelve `{ ok, output, error?, simulated }`.
  `output` vuelve al agente como resultado de la herramienta. No lances excepciones por fallos
  esperados del proveedor: devuelve `ok: false` con un `error` legible para que el agente se corrija.

## 2. Anadir uno

1. Parte de `server/src/connectors/stubs.ts` (ya tiene `whatsapp`, `voice_tts` y `email` con su
   configuracion definitiva) o crea un archivo nuevo en `server/src/connectors/`.
2. Reemplaza el cuerpo de `execute()` por la llamada al proveedor y pon `simulated: false` y
   `maturity: 'ready'`. Usa `fetch` con timeout (`AbortSignal.timeout`) y limita el tamano de la respuesta.
3. Registralo en `createConnectorRegistry()` (`server/src/connectors/index.ts`) o pasalo como
   `extra`. Aparece solo en el editor de acciones.
4. Anade tests con el proveedor simulado (ver `server/test/connectors.test.ts`).

## 3. Mensajes entrantes

Los eventos entrantes (un WhatsApp recibido, un email, una transcripcion de llamada) deben pasar por
`Engine.submitRequest(tenantId, texto)`, el mismo punto que usa `POST /api/requests`:

```ts
// Ejemplo: webhook de entrada en server/src/api (ruta nueva, p. ej. POST /api/inbound/whatsapp)
app.post('/api/inbound/whatsapp', async (req, reply) => {
  verifySignature(req);                       // firma HMAC del proveedor, obligatoria
  const { from, text } = parseProviderPayload(req.body);
  const tenantId = resolveTenantByNumber(from); // hoy: store.getDefaultTenant().id
  engine.submitRequest(tenantId, `[WhatsApp de ${from}] ${text}`);
  return reply.status(200).send({ ok: true });  // responder rapido: la orquestacion corre en segundo plano
});
```

Para contestar al remitente, declara una accion de salida (p. ej. `enviar_whatsapp`) en el agente de
Comunicaciones o Soporte. Si hace falta correlacionar la conversacion, guarda el identificador del
remitente en el texto de la solicitud o amplia el modelo de tareas con un campo de origen.

Voz/TTS: el flujo es el mismo con una capa de STT delante (audio a texto antes de `submitRequest`) y
un conector de salida que convierte el texto del agente en audio.

## 4. Credenciales

- **Nunca** en `connectorConfig`: se guarda en la base de datos y se muestra en la UI y en las respuestas de la API.
- Usa variables de entorno (`WHATSAPP_TOKEN`, `SMTP_PASSWORD`...) leidas dentro del conector, o un gestor de secretos.
- En `connectorConfig` deja solo datos no sensibles: plantilla, remitente, idioma, voz, URL base.
- No devuelvas secretos en `output` ni en `error`: el agente (y el LLM) los veria.
- Registra en el log de auditoria (`ActionRun`) solo parametros que ya sean seguros de almacenar.

## 5. Que falta para multi-tenant real

- **Autenticacion y sesion**: el helper `tenantOf` de `server/src/api/index.ts` es el unico punto que
  resuelve el tenant; hoy devuelve el tenant demo y debe leerlo de la sesion o token. Lo mismo en los
  webhooks de entrada (numero o dominio a tenant) y en el SSE.
- **Credenciales por tenant**: tabla cifrada de secretos por conector y tenant, en lugar de variables globales.
- **Bus de eventos y motor**: ya separan por `tenantId`; con varias instancias hace falta un bus compartido (Redis) y una cola de trabajos.
- **Base de datos**: migrar SQLite a Postgres con `tenant_id` en cada indice y, idealmente, row-level security.
- **Limites y facturacion**: cuotas por tenant (solicitudes, tokens, ejecuciones) y control del gasto en LLM.
- **Roles**: quien edita acciones, quien aprueba, quien solo ve.
- **SSRF y aislamiento**: el conector webhook ya bloquea direcciones privadas; mantenlo y anade lista de destinos permitidos por tenant.
