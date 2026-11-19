# Agentic Office

Plantilla de equipo de agentes AI para un SaaS: un CEO que orquesta y agentes por area (Soporte,
Marketing, Contabilidad, Comunicaciones, Ventas, RR. HH.). El cliente declara las acciones que cada
agente puede ejecutar; el CEO delega y una oficina pixel-art muestra el trabajo en tiempo real.
Detalle completo en [SPEC.md](SPEC.md).

## Inicio rapido

```bash
npm install
npm run dev          # servidor (8787) + web (5173)
```

Abre http://localhost:5173 y escribele una solicitud al CEO. Sin API key arranca en modo simulacion.

```bash
npm test             # tests del servidor
npm run typecheck
npm run build && npm start   # produccion: el servidor sirve web/dist en el mismo puerto
```

## Simulacion vs. real

- **Simulacion** (por defecto): un LLM mock determinista; no gasta tokens. Util para demos y tests.
- **Real**: define `ANTHROPIC_API_KEY`. El CEO usa Opus; los agentes de area usan Sonnet y escalan a
  Opus cuando el CEO marca la subtarea como `complex`. Fuerza la simulacion con `LLM_MODE=mock`.

## Variables de entorno

Opcional: copia `.env.example` a `.env` en esta carpeta; el servidor lo carga al arrancar y las
variables ya definidas en el entorno tienen prioridad.

| Variable | Defecto | Descripcion |
|----------|---------|-------------|
| `PORT` | `8787` | Puerto del servidor. |
| `DB_PATH` | `./data/agentic-office.db` | Archivo SQLite, relativo al directorio de trabajo (`server/` con los scripts npm). `:memory:` para pruebas. |
| `ANTHROPIC_API_KEY` | (vacia) | Activa el modo real. |
| `LLM_MODE` | (vacia) | `mock` fuerza la simulacion. |
| `MODEL_OPUS` / `MODEL_SONNET` | `claude-opus-5-5` / `claude-sonnet-5-5` | Ids de modelo. |
| `MOCK_STEP_DELAY_MS` | `900` | Pausa entre pasos en simulacion (para que se vea la animacion). |
| `WEBHOOK_ALLOW_PRIVATE` | (vacia) | `1` permite al conector webhook llamar a direcciones privadas. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origenes externos que pueden usar la API (coma). El mismo origen siempre se admite; el resto recibe 403 al modificar datos. |

## Estructura

```
shared/   tipos de dominio, eventos y DTOs (fuente de verdad)
server/   Fastify: api/, engine/, llm/, connectors/, store/ (SQLite), events/
web/      React + Vite: oficina en canvas y paneles
docs/     INTEGRATIONS.md
```

## Como orquesta

1. `POST /api/requests` crea la tarea raiz del CEO y responde de inmediato.
2. El CEO (Opus) recibe el equipo habilitado con sus acciones y devuelve un plan estructurado.
3. Cada subtarea se delega a un agente de area; agentes distintos corren en paralelo.
4. Cada agente ejecuta un bucle de herramientas con sus acciones (max. 8 turnos).
5. Los parametros se validan contra la definicion de la accion antes de ejecutarla.
6. Una accion con `requiresApproval` queda en la bandeja y pausa la subtarea.
7. Aprobar ejecuta el conector; rechazar devuelve el motivo al agente, que continua.
8. Cuando terminan todas las subtareas, el CEO sintetiza la respuesta final.
9. Todo se emite por SSE (`GET /api/events`) y la oficina lo anima.
10. Al reiniciar, las tareas a medias fallan, salvo las que esperan aprobacion.

## Limites del MVP

- Un solo tenant demo, sin login ni roles (todo el codigo ya filtra por `tenant_id`).
- WhatsApp, voz/TTS y email son stubs: configuracion real, ejecucion simulada.
- Sin memoria entre solicitudes, tareas programadas ni archivos adjuntos.
- SQLite y orquestacion en el mismo proceso: sin colas ni workers; pensado para una instancia.
- El bus de eventos es en memoria: se pierde al reiniciar.
