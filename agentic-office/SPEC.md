# Agentic Office — Spec del MVP

Plantilla de equipo de agentes AI para un SaaS: un CEO que orquesta y agentes por área de la
empresa. El cliente declara las acciones que cada agente puede ejecutar; el CEO delega las
solicitudes; una oficina pixel-art muestra a los agentes trabajando en tiempo real.

## 1. Decisiones (entrevista)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Convivencia con el repo | Carpeta nueva `agentic-office/`, independiente. El código Python existente no se toca. |
| 2 | Stack | TypeScript full-stack: Node 22 + Fastify, React + Vite, SQLite (`node:sqlite`, sin dependencias nativas). |
| 3 | Oficina visual | Pixel-art 2D vista desde arriba, dibujada por código en `<canvas>` (sin assets de terceros). |
| 4 | Declaración de acciones | Formulario en la UI; se guarda como parámetros tipados y se expone al agente como herramienta con JSON Schema. |
| 5 | Áreas por defecto | Soporte, Marketing, Contabilidad, Comunicaciones, más Ventas y RR. HH. (ver §2). |
| 6 | Tenancy | Un solo tenant demo, sin login. Todas las tablas llevan `tenant_id` y toda consulta filtra por él. |
| 7 | Supervisión | Por acción: marca `requiresApproval`; las marcadas quedan en una bandeja hasta aprobar o rechazar. |
| 8 | Conectores | Webhook genérico (HTTP real) e Interno (simulado). Registro extensible para WhatsApp, voz/TTS, email. |
| 9 | Modelos | CEO planifica y sintetiza con Opus. Agentes de área usan su modelo por defecto (Sonnet) y escalan a Opus si el CEO marca la subtarea como `complex`. |
| 10 | Desarrollo | Flujo multi-agente: Opus para las piezas complejas y la revisión, Sonnet para la implementación directa. Commit y push a la rama, sin PR. |

## 2. Áreas adicionales

Se pidió validar qué otras áreas se gestionan hoy con agentes. La búsqueda no arrojó un ranking
fiable por función (las encuestas de 2026 reportan adopción global, no por área), así que la
elección se apoya en las categorías de producto más establecidas:

- **Ventas** — prospección y seguimiento de leads es, junto a soporte, el caso de uso con más productos dedicados.
- **RR. HH.** — selección, onboarding y consultas internas de personal.

Ambas vienen en la plantilla y, como cualquier área, se pueden desactivar o borrar.

## 3. Alcance

**Incluido**

- Plantilla precargada: CEO + 6 áreas, cada una con 2–3 acciones de ejemplo.
- CRUD de agentes de área y de acciones.
- Envío de una solicitud en lenguaje natural; el CEO la descompone, delega y sintetiza la respuesta.
- Bandeja de aprobaciones y registro de auditoría de cada acción ejecutada.
- Oficina en tiempo real (SSE): estados, recorridos de delegación, globos de diálogo.
- Modo simulación sin API key (LLM mock determinista), usado también por los tests.

**Fuera de alcance**

- Login, roles, facturación y multi-tenant efectivo.
- Integraciones reales de WhatsApp, voz/TTS y email (queda la interfaz y la guía, §8).
- Memoria de largo plazo entre solicitudes, tareas programadas, subida de archivos.
- Despliegue productivo (Postgres, colas, workers separados).

## 4. Arquitectura

```
agentic-office/
  shared/src/index.ts      Tipos de dominio, eventos y DTOs. Fuente de verdad.
  server/src/
    contracts.ts           Interfaces internas: Store, EventBus, LLMProvider, Connector, Engine.
    config.ts              Variables de entorno -> Config.
    store/                 SQLite + plantilla inicial (seed).
    events/                EventBus en memoria.
    llm/                   anthropic.ts (real) y mock.ts (simulación).
    connectors/            internal, webhook, registro.
    engine/                Orquestador.
    api/                   Rutas REST + SSE.
    index.ts               Composition root.
  web/src/
    api/                   Cliente REST + suscripción SSE + estado global.
    office/                Canvas pixel-art.
    panels/                Solicitudes, tareas, aprobaciones, agentes, acciones.
```

El servidor sirve la API en `/api` y, si existe `web/dist`, también el frontend compilado.
En desarrollo, Vite hace proxy de `/api` al servidor.

## 5. Orquestación

1. `POST /api/requests` crea la tarea raíz (del CEO) y responde de inmediato.
2. **Planificación** — el CEO (Opus) recibe el equipo habilitado con sus acciones y devuelve un
   plan estructurado: subtareas `{agentKey, title, instructions, complexity}` o una respuesta
   directa si no hace falta delegar. Subtareas con `agentKey` desconocido se descartan.
3. **Delegación** — por cada subtarea se crea una tarea hija y se emite `delegation`.
   Las subtareas de agentes distintos corren en paralelo; las de un mismo agente, en serie.
4. **Ejecución** — cada agente corre un bucle de herramientas con sus acciones habilitadas.
   Modelo: `complex` → Opus; si no, el `defaultModel` del agente. Máximo 8 turnos por subtarea.
   - Los parámetros se validan contra la definición antes de ejecutar; si fallan, el agente
     recibe el error como resultado y puede corregir.
   - Acción sin aprobación: se ejecuta por su conector y el resultado vuelve al agente.
   - Acción con aprobación: se crea un `ActionRun` en `pending_approval`, se guarda la
     conversación y la subtarea queda en `waiting_approval`. Si en el mismo turno hay varias
     llamadas, las que no requieren aprobación se ejecutan y el turno se reanuda cuando todas
     las pendientes están resueltas.
   - Aprobar ejecuta el conector; rechazar devuelve al agente un resultado de error con la nota
     del usuario. En ambos casos el bucle continúa.
5. **Síntesis** — cuando todas las hijas terminan, el CEO (Opus) redacta la respuesta final.
   Si alguna hija falla, la raíz igual se completa e informa qué falló; si fallan todas, la raíz falla.
6. **Reinicio** — al arrancar, las tareas a medias se marcan como fallidas, excepto las que
   esperan aprobación, que se pueden reanudar porque su conversación está persistida.

### Uso de la API de Claude

- SDK oficial `@anthropic-ai/sdk`, Messages API con bucle manual (hace falta pausar para aprobar).
- Modelos `claude-opus-5-5` y `claude-sonnet-5-5`, configurables por entorno.
- Sin `tool_choice` forzado, sin `temperature` ni `budget_tokens` (estos modelos los rechazan).
  El plan se obtiene con salida estructurada (`output_config.format`).
- `output_config.effort` explícito: `medium` para el CEO, `low` para agentes en Sonnet, `medium` al escalar a Opus.
- Las acciones se declaran como herramientas con `strict: true` y `additionalProperties: false`.
- Se devuelve `response.content` completo en cada turno y todos los `tool_result` en un solo mensaje.
- Se manejan `stop_reason` `refusal` y `max_tokens` como fallo de la subtarea con mensaje claro.

## 6. API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Modo LLM y modelos configurados. |
| GET | `/api/state` | Tenant, agentes, acciones, conectores y estado actual de cada agente. |
| POST / PATCH / DELETE | `/api/agents[/:id]` | CRUD de agentes de área. El CEO solo se puede editar. |
| POST / PATCH / DELETE | `/api/actions[/:id]` | CRUD de acciones. |
| POST | `/api/requests` | Nueva solicitud al CEO. |
| GET | `/api/tasks`, `/api/tasks/:id` | Árboles de tareas con sus ejecuciones de acciones. |
| GET | `/api/approvals` | Acciones pendientes de aprobación. |
| POST | `/api/action-runs/:id/approve`, `/reject` | Resolver una aprobación. |
| GET | `/api/events` | SSE de `OfficeEvent`; admite `Last-Event-ID` para reponer eventos. |

Errores: `{ error, details? }` con 400 (validación), 404 o 409 (clave duplicada, estado inválido).

## 7. Frontend

- **Oficina** (pantalla principal): despacho del CEO arriba, un escritorio por área, zona común.
  Los personajes escriben al trabajar, muestran un indicador al pensar o esperar aprobación, y el
  CEO camina hasta el escritorio del agente al delegar. Clic en un agente abre su detalle.
- **Barra de solicitud**: campo de texto para pedirle algo al CEO, con ejemplos.
- **Panel lateral** con pestañas: Actividad (tareas y resultado final), Aprobaciones (con contador),
  Equipo (agentes), Acciones (editor con parámetros, conector y marca de aprobación).
- Interfaz en español. Indicador visible de modo simulación.

## 8. Conectores e integraciones futuras

Un conector implementa `Connector` (`server/src/contracts.ts`): metadatos, validación de
configuración y `execute`. Para añadir WhatsApp, voz/TTS o email se crea un archivo en
`server/src/connectors/`, se registra y aparece solo en el editor de acciones. Los mensajes
entrantes (p. ej. un WhatsApp recibido) entran por `Engine.submitRequest`, el mismo punto que usa
la API. La guía paso a paso está en `docs/INTEGRATIONS.md`.

## 9. Criterios de aceptación

1. `npm install && npm run dev` levanta todo sin API key, en modo simulación.
2. Con la plantilla inicial, una solicitud que toca varias áreas genera subtareas para los agentes
   correctos y una respuesta final del CEO.
3. Una acción con aprobación pausa la subtarea; aprobar la reanuda y rechazar le llega al agente.
4. Crear una acción nueva desde la UI la deja disponible para el agente en la siguiente solicitud.
5. La oficina refleja en vivo estados, delegaciones y aprobaciones pendientes.
6. `npm run typecheck` y `npm test` pasan. Los tests cubren el motor en modo simulación
   (plan, delegación, aprobación, rechazo, fallo de conector) y la API.
7. Con `ANTHROPIC_API_KEY` el servidor usa Claude sin cambios de código.
