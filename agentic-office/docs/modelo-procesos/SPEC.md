# SPEC — Modelo de procesos de la empresa (Empresa → Áreas → Procesos → Tareas → Ejecuciones)

Lleva [PROCESOS.md](PROCESOS.md) a un modelo de datos que la app pueda usar: áreas como entidad,
catálogo de procesos, tareas recurrentes que se ejecutan solas, agenda del día del CEO y políticas
de aprobación por umbral. Extiende el dominio del MVP sin romperlo.

## 0. Base, alcance y regla de verificación

- **Base de lectura:** el dominio del MVP en la rama remota `claude/ai-agents-template-saas-8y3ug9`
  (commit `eae8a53`): `shared/src/index.ts`, `server/src/store/index.ts`, `server/src/engine/`,
  `server/src/api/index.ts`, `server/src/store/seed.ts`, `server/src/llm/mock.ts`,
  `docs/INTEGRATIONS.md`.
- **Regla M-00:** la integración real es `ov2/integracion`, que no estaba disponible al redactar
  este SPEC. La Oficina v2 fue un frente visual, pero antes de implementar se verifica que esos
  archivos no hayan cambiado ahí. Toda diferencia se anota como desvío en PLAN.md y, si toca el
  contrato, se corrige este SPEC antes de seguir.
- **Incluye:** tipos compartidos, tablas y migración, seed "Aster Consultores", programador de
  recurrentes, integración con el motor y los prompts, API REST y pruebas.
- **No incluye:** la interfaz nueva (será el HUD del CEO, propuesto en `docs/diseno-hud/`), un motor
  BPM, aprobación de documentos o planes, feriados, login y roles reales.

## 1. Decisiones

| # | Decisión | Por qué |
|---|----------|---------|
| D-M01 | **Empresa = `Tenant`**, ampliado con un perfil: rubro, zona horaria, moneda, días hábiles y un interruptor del programador. | Ya existe `tenantId` en todas las tablas; no hace falta otra entidad. |
| D-M02 | **`Area` pasa a ser entidad.** `Agent` gana `areaId`; el texto `Agent.area` se conserva como nombre desnormalizado que mantiene el store. | La oficina 3D, la lista "Equipo en la oficina" y los paneles leen `agent.area`; así no se tocan. |
| D-M03 | **No se renombran claves de agentes** (`ventas`, `contabilidad`, `rrhh`…). Las áreas tienen su propia clave (`comercial`, `finanzas`, `personas`…). | Las claves están en el mock del LLM, en planes guardados y en las pruebas. |
| D-M04 | **El proceso es catálogo y contexto, no un motor de flujo.** Sus pasos documentan y orientan al CEO; no se ejecutan uno a uno. | Un motor BPM está fuera de escala para una pyme y para esta etapa. |
| D-M05 | **Una tarea recurrente se materializa en una tarea raíz del CEO.** Si el asignado es el CEO, sigue el flujo normal (planificar → delegar → sintetizar). Si es un agente de área, la raíz nace con una sola subtarea ya planificada para ese agente (sin llamar a Opus para planificar) y su resultado pasa a la raíz sin síntesis. | Mantiene la invariante "la raíz es del CEO", la animación de delegación y el costo bajo. |
| D-M06 | **Programador dentro del proceso del servidor**, con un ciclo cada 60 s y reloj inyectable. Es idempotente gracias a la tabla de ocurrencias con `UNIQUE(recurring_task_id, occurrence_date)`. Solo recupera ocurrencias del día local en curso; las de días anteriores quedan como `missed`. | Una sola instancia (como el MVP); sin dependencias nuevas; las pruebas no esperan tiempo real. |
| D-M07 | **Aprobación efectiva = `action.requiresApproval` O alguna `ApprovalPolicy` que aplique.** Una política solo puede **agregar** aprobación o exigir nota; nunca la quita. | Monotonía: una política mal escrita no puede abrir una puerta. |
| D-M08 | **Ningún agente aprueba.** El CEO solo prepara la bandeja (R-DIR-04); aprueba el humano (`resolvedBy: 'owner'`). | Principio rector de PROCESOS §2. |
| D-M09 | **La agenda del día es una vista calculada** (`GET /api/agenda`), no una tabla. | Se deriva de recurrentes, ocurrencias, tareas y aprobaciones; guardarla duplicaría estado. |
| D-M10 | **Sin tipos de evento nuevos.** El CRUD de áreas, procesos, recurrentes y políticas emite `config.changed`; las tareas materializadas emiten los `task.created` y `delegation` de siempre, con los campos nuevos. | El frontend actual (y la oficina 3D) no necesita cambios para seguir funcionando. |
| D-M11 | **`Agent.reportsToAgentId`** (opcional) es informativo en esta etapa: el CEO puede delegar en cualquier agente habilitado. | Prepara la etapa "Mediana" (PROCESOS §9) sin cambiar la orquestación. |
| D-M12 | **Contexto entregado, no herramientas del CEO.** Una recurrente declara `contextSources` (agenda, tareas abiertas, aprobaciones pendientes) y `prefetchActionIds` (acciones de solo lectura del asignado, p. ej. `leer_bandeja`). El motor los resuelve antes de lanzar la tarea y los anexa a las instrucciones. | El CEO del MVP no corre un bucle de herramientas; así no se toca su flujo. |
| D-M13 | **Seed nuevo `servicios-b2b` para bases nuevas**; las bases existentes se migran en el lugar (áreas derivadas de los valores distintos de `agent.area`) sin cargar el seed nuevo. | No se pierden los datos de quien ya usa el MVP. |
| D-M14 | **Contexto de procesos en los prompts, con presupuesto.** El CEO recibe la lista de áreas y procesos (código, nombre y área); cada agente recibe los procesos de su área con sus pasos. El tope es de 2 000 tokens estimados (4 caracteres por token); si se excede, se recorta por área de forma determinista. | Mejora el ruteo sin inflar el costo por solicitud. |
| D-M15 | **Zona horaria sin dependencias:** `Intl.DateTimeFormat` y un helper `zonedTimeToUtc` con pruebas de cambio de horario en `America/Santiago`. | El presupuesto de dependencias del MVP es cero nativas. |

## 2. Modelo

```
Tenant (Empresa) ─┬─< Area ──────────< Agent ──< ActionDef ──< ApprovalPolicy
   perfil         │    │ parentAreaId    │ reportsToAgentId
                  │    └─< Process ──────┤ (ownerAgentId)
                  │          │           │
                  │          └─< RecurringTask (agentId = asignado)
                  │                  │
                  │                  └─< TaskOccurrence (1 por día local)
                  │                            │ taskId
                  └─< Task (raíz, del CEO) ◄───┘
                        │  origin, processId, recurringTaskId, occurrenceDate
                        └─< Task (subtareas) ──< ActionRun (ejecución + aprobación)
                                                   policyId, requireNote, resolvedBy
```

Cardinalidades: un área tiene 0..n agentes y un agente líder (`leadAgentId`); un agente pertenece a
un área. Un proceso pertenece a un área. Una recurrente pertenece a 0..1 proceso y a un agente.
Una ocurrencia por recurrente y fecha local. Una ocurrencia materializada apunta a una tarea raíz.

## 3. Contrato (`shared/src/index.ts`)

Los campos nuevos de tipos existentes son **opcionales o anulables**, para que el cliente viejo
siga compilando y funcionando.

```ts
// ---------- Empresa ----------
export interface CompanyProfile {
  industry: string;               // "Servicios B2B"
  timezone: string;               // IANA, p. ej. "America/Santiago"
  currency: string;               // ISO 4217, p. ej. "CLP"
  workdays: number[];             // ISO 1=lunes..7=domingo; por defecto [1,2,3,4,5]
  schedulerEnabled: boolean;      // apaga todas las recurrentes automáticas del tenant
}
export interface Tenant { id: string; name: string; profile?: CompanyProfile } // profile siempre presente en respuestas nuevas

// ---------- Áreas ----------
export interface Area {
  id: string; tenantId: string;
  key: string;                    // AGENT_KEY_PATTERN, única por tenant
  name: string; description: string;
  parentAreaId: string | null;    // sub-áreas (etapa Mediana)
  leadAgentId: string | null;     // agente a cargo
  sortOrder: number; enabled: boolean; createdAt: string;
}
export interface AreaInput { key: string; name: string; description: string;
  parentAreaId: string | null; leadAgentId: string | null; sortOrder: number; enabled: boolean }

// Agent: campos nuevos
//   areaId: string | null;            // null solo durante la migración; el store lo completa
//   reportsToAgentId: string | null;
// AgentInput: areaId?: string (preferido). Si llega solo `area` (texto), se busca un área
//   por nombre sin distinguir mayúsculas; si no existe, se crea (clave = slug del nombre).

// ---------- Procesos ----------
export type ProcessKind = 'estrategico' | 'operativo' | 'soporte';
export interface ProcessStep { order: number; title: string; agentKey?: string; actionKey?: string }
export interface Process {
  id: string; tenantId: string; areaId: string;
  key: string;                    // AGENT_KEY_PATTERN, p. ej. "com-02"
  code: string;                   // visible, p. ej. "P-COM-02"
  name: string; kind: ProcessKind;
  purpose: string; trigger: string;
  steps: ProcessStep[];           // máximo 12
  kpis: string[];                 // máximo 6
  ownerAgentId: string | null;
  enabled: boolean; createdAt: string; updatedAt: string;
}
export type ProcessInput = Omit<Process, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;

// ---------- Recurrentes ----------
export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  time: string;                   // "HH:MM" local del tenant
  byWeekday?: number[];           // weekly: ISO 1..7
  byMonthDay?: number[];          // monthly: 1..31 (si el mes no lo tiene, se omite ese mes)
  byBusinessDay?: number[];       // monthly: 1..23 = n-ésimo día hábil; -1 = último día hábil
  businessDaysOnly?: boolean;     // daily: solo días hábiles (por defecto true)
}
export type ContextSource = 'agenda_today' | 'open_tasks' | 'pending_approvals';
export type RecurringMode = 'auto' | 'manual';
export interface RecurringTask {
  id: string; tenantId: string;
  processId: string | null; agentId: string;
  code: string;                   // "R-DIR-01"
  title: string; instructions: string;
  recurrence: Recurrence;
  mode: RecurringMode;
  complexity: Complexity;
  contextSources: ContextSource[];
  prefetchActionIds: string[];    // acciones del propio agente sin aprobación efectiva; máx. 3
  enabled: boolean; createdAt: string; updatedAt: string;
}
export type RecurringTaskInput = Omit<RecurringTask, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;

export type OccurrenceStatus = 'materialized' | 'skipped';
export interface TaskOccurrence {
  id: string; tenantId: string; recurringTaskId: string;
  occurrenceDate: string;         // "AAAA-MM-DD" local
  status: OccurrenceStatus; taskId: string | null; createdAt: string;
}

// ---------- Task: campos nuevos (anulables) ----------
export type TaskOrigin = 'request' | 'recurring' | 'inbound' | 'delegation';
//   origin: TaskOrigin;              // raíces: request | recurring | inbound; hijas: delegation
//   processId: string | null;
//   recurringTaskId: string | null;
//   occurrenceDate: string | null;

// ---------- Aprobaciones ----------
export type PolicyOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
export interface ApprovalPolicy {
  id: string; tenantId: string;
  code: string;                   // "U-01"
  name: string;
  actionId: string;
  condition: { param: string; op: PolicyOp; value: number | string | boolean } | null; // null = siempre
  requireApproval: true;          // literal: una política nunca la quita (D-M07)
  requireNote: boolean;
  approverRole: 'owner';          // único rol en esta etapa
  enabled: boolean; createdAt: string;
}
export type ApprovalPolicyInput = Omit<ApprovalPolicy, 'id' | 'tenantId' | 'createdAt'>;

// ActionRun: campos nuevos (anulables)
//   policyId: string | null;        // primera política que aplicó (orden por code)
//   requireNote: boolean;           // OR de las políticas que aplicaron
//   resolvedBy: 'owner' | null;

// ---------- Agenda (vista) ----------
export type AgendaStatus =
  | 'scheduled'        // aún no llega su hora
  | 'due'              // manual, ya llegó su hora y nadie la lanzó
  | 'running'          // la raíz está en queued | planning | running
  | 'waiting_approval'
  | 'done' | 'failed'
  | 'skipped'
  | 'missed';          // automática de un día anterior que no se materializó
export interface AgendaItem {
  recurringTaskId: string; code: string; title: string;
  agentId: string; processId: string | null; mode: RecurringMode;
  dueAt: string;                  // ISO UTC
  status: AgendaStatus; taskId: string | null;
}
export interface AgendaResponse {
  date: string; timezone: string;
  items: AgendaItem[];            // ordenadas por dueAt
  overdue: AgendaItem[];          // 'due' o 'missed' de los 7 días anteriores
  pendingApprovals: ActionRun[];
}
```

`StateResponse` agrega `areas: Area[]` y el perfil en `tenant.profile`. Procesos, recurrentes y
políticas tienen endpoints propios (§6), para no engordar el estado inicial.

## 4. Persistencia (SQLite) y migración

Tablas nuevas (todas con `tenant_id` y filtradas por él en toda consulta):

| Tabla | Columnas clave | Restricciones |
|-------|----------------|---------------|
| `company_profiles` | `tenant_id` PK, `industry`, `timezone`, `currency`, `workdays` (JSON), `scheduler_enabled` | 1:1 con `tenants` |
| `areas` | `id`, `tenant_id`, `key`, `name`, `description`, `parent_area_id`, `lead_agent_id`, `sort_order`, `enabled`, `created_at` | `UNIQUE(tenant_id, key)` |
| `processes` | `id`, `tenant_id`, `area_id`, `key`, `code`, `name`, `kind`, `purpose`, `trigger`, `steps` (JSON), `kpis` (JSON), `owner_agent_id`, `enabled`, `created_at`, `updated_at` | `UNIQUE(tenant_id, key)`; índice `(tenant_id, area_id)` |
| `recurring_tasks` | `id`, `tenant_id`, `process_id`, `agent_id`, `code`, `title`, `instructions`, `recurrence` (JSON), `mode`, `complexity`, `context_sources` (JSON), `prefetch_action_ids` (JSON), `enabled`, `created_at`, `updated_at` | `UNIQUE(tenant_id, code)` |
| `task_occurrences` | `id`, `tenant_id`, `recurring_task_id`, `occurrence_date`, `status`, `task_id`, `created_at` | `UNIQUE(tenant_id, recurring_task_id, occurrence_date)` |
| `approval_policies` | `id`, `tenant_id`, `code`, `name`, `action_id`, `condition` (JSON), `require_note`, `approver_role`, `enabled`, `created_at` | `UNIQUE(tenant_id, code)`; índice `(tenant_id, action_id)` |

Columnas nuevas (con `ALTER TABLE … ADD COLUMN`, el mismo patrón que ya usa el store para
`action_runs.note`):

- `agents`: `area_id TEXT`, `reports_to_agent_id TEXT`.
- `tasks`: `origin TEXT NOT NULL DEFAULT 'request'`, `process_id TEXT`, `recurring_task_id TEXT`,
  `occurrence_date TEXT`.
- `action_runs`: `policy_id TEXT`, `require_note INTEGER NOT NULL DEFAULT 0`, `resolved_by TEXT`.

**Migración de una base del MVP** (idempotente, en una transacción, dentro de `store.init()`):
1. Crea las tablas nuevas y agrega las columnas que falten (consultando `PRAGMA table_info`).
2. Por cada tenant sin fila en `company_profiles`, crea el perfil por defecto (`industry: ''`,
   `timezone: 'America/Santiago'`, `currency: 'CLP'`, `workdays: [1..5]`, `scheduler_enabled: 1`).
3. Por cada valor distinto de `agents.area` sin área, crea un área (clave = slug del nombre; si
   choca, se agrega un sufijo `-2`, `-3`…). Asigna `area_id` a cada agente y fija como líder al
   primer agente creado de esa área. El área del CEO es su `area` ("Direccion" en el MVP).
4. Las tareas hijas existentes (`parent_id` no nulo) quedan con `origin = 'delegation'`; las raíces
   conservan el valor por defecto `'request'`.
5. **No** se cargan procesos, recurrentes ni políticas en bases migradas (D-M13).

Reglas de borrado (409 con mensaje claro): un área con agentes; un agente con recurrentes o que es
líder de un área; un proceso con recurrentes; una acción con políticas. El área del CEO no se
borra. El historial (`tasks`, `action_runs`) conserva ids aunque el proceso o la recurrente se
borren; la UI muestra "eliminado".

Sincronía de `agents.area`: cada vez que se crea o edita un agente con `areaId`, o se renombra un
área, el store reescribe `agents.area` con el nombre del área, en la misma transacción.

## 5. Comportamiento

### 5.1 Programador de recurrentes

- Configuración: `SCHEDULER_ENABLED` (por defecto `true`; `false` en las pruebas que no lo usan) y
  `SCHEDULER_TICK_MS` (por defecto 60 000).
- En cada ciclo, por cada tenant con `schedulerEnabled`, y por cada recurrente habilitada en modo
  `auto` con su agente habilitado:
  1. Calcula la ocurrencia del **día local actual** (`occurrenceFor(rec, localDate, profile)`).
  2. Si existe, `dueAt <= now` y no hay fila en `task_occurrences`: dentro de una transacción
     inserta la ocurrencia; si la inserción choca con el `UNIQUE`, otro ciclo ya la tomó y se sigue.
     Fuera de la transacción llama a `engine.submitScheduled(...)` y guarda el `taskId`.
- Un fallo al lanzar una ocurrencia se registra en el log y no detiene a las demás.
- Al arrancar se ejecuta un ciclo inmediato (recupera lo del día). Los días anteriores no se
  recuperan: aparecen como `missed` en la agenda.

**Cálculo de ocurrencias** (función pura, con pruebas de tabla):
- `daily`: todos los días o solo los hábiles (`businessDaysOnly`, por defecto `true`).
- `weekly`: días de `byWeekday`.
- `monthly`: unión de `byMonthDay` (un día que el mes no tiene se omite ese mes) y `byBusinessDay`
  (el n-ésimo día hábil del mes según `workdays`; `-1` = último hábil; si el mes tiene menos de n
  días hábiles, se omite ese mes).
- Varias horas en el mismo día (p. ej. R-DIR-04 a las 10:00, 15:00 y 17:30) se modelan como
  **recurrentes distintas** (`R-DIR-04a/b/c`). Así se mantiene "una ocurrencia por recurrente y día".
- `dueAt` = fecha local + `time` en la zona del tenant, convertida a UTC con `zonedTimeToUtc`. Si la
  hora local no existe (salto de horario hacia adelante), se usa el primer minuto válido siguiente.
  Si es ambigua (salto hacia atrás), se usa la primera.

### 5.2 Materialización (`Engine.submitScheduled(tenantId, rec, occurrenceDate)`)

1. Resuelve el contexto: por cada `contextSource` arma un bloque de texto compacto (agenda del día:
   código, título, estado y hora; tareas abiertas: título, agente, estado y antigüedad; aprobaciones
   pendientes: acción, agente, parámetros e importe si existe). Cada bloque se corta en 40 líneas.
2. Ejecuta cada `prefetchActionId` por su conector, con la validación habitual. Si una política la
   volviera aprobable, **no** se ejecuta y se anota "omitida: requiere aprobación". Se anexa la salida,
   recortada a 4 000 caracteres.
3. Crea la raíz: `agentId = CEO`, `origin = 'recurring'`, `processId`, `recurringTaskId`,
   `occurrenceDate`, título = `"{code} · {title}"`, instrucciones = `instructions` + bloques.
4. Si `rec.agentId` es el CEO: sigue el flujo normal desde la planificación.
   Si es un agente de área: crea una única hija ya planificada para ese agente (con `complexity` y
   `processId` de la recurrente), emite `delegation`, y al terminar copia el resultado (o el error)
   a la raíz sin llamar a la síntesis (D-M05).
5. Las acciones con aprobación efectiva de esa ejecución pasan por la bandeja como siempre.

Lanzar a mano: `POST /api/recurring-tasks/:id/run` con `{ date? }` (por defecto, hoy local). Sirve
para recurrentes `manual` y `auto`; si ya hay una ocurrencia para esa fecha, responde 409.
Omitir: `POST /api/recurring-tasks/:id/skip` con `{ date }` crea la ocurrencia `skipped` (409 si ya
existe).

### 5.3 Aprobación efectiva

Al recibir una llamada a herramienta ya validada:
1. `policies = políticas habilitadas de esa acción, ordenadas por code`.
2. Una política aplica si `condition` es nula, o si el parámetro existe en la llamada y cumple el
   operador. Los operadores `gt|gte|lt|lte` solo valen para parámetros `number`; `eq|neq`, para
   cualquier tipo. Si el parámetro falta, la política **no** aplica.
3. `requiere = action.requiresApproval || alguna aplica`;
   `requireNote = alguna aplicada con requireNote`; `policyId = la primera aplicada`.
4. Al **aprobar**, si `requireNote` es verdadero y la nota viene vacía o con solo espacios, la API
   responde 400. Rechazar no exige nota (ya existe el campo).
5. `resolvedBy = 'owner'` en toda resolución hecha por la API.

Validación al crear o editar una política: la acción existe y es del tenant; `condition.param` está
en `action.params`; el tipo de `value` coincide con el del parámetro; los operadores numéricos solo
se usan con parámetros `number`. Si algo falla, 400 con `details`.

### 5.4 Agenda (`GET /api/agenda?date=AAAA-MM-DD`)

- `date` es opcional (por defecto, hoy en la zona del tenant). Un formato inválido da 400.
- `items`: una por cada recurrente habilitada con ocurrencia en esa fecha. El estado sale de la
  ocurrencia y de su tarea raíz: sin ocurrencia y `dueAt > now` → `scheduled`; sin ocurrencia,
  `manual` y `dueAt <= now` → `due`; sin ocurrencia, `auto`, en un día anterior → `missed` (hoy
  sigue `scheduled` hasta que el ciclo la tome); `skipped`; con tarea → el estado de la raíz
  (`completed` → `done`).
- `overdue`: ítems `due` o `missed` de los 7 días anteriores.
- `pendingApprovals`: igual que `GET /api/approvals`.

### 5.5 Prompts (D-M14)

- **Planificación del CEO:** se agrega una sección "Estructura de la empresa" con las áreas
  (nombre, líder y agentes) y los procesos (`code — name (área)`). El esquema del plan acepta un
  `processKey` opcional por subtarea; si la clave no existe, se guarda `null` (no se descarta la
  subtarea).
- **Agente de área:** se agrega "Procesos de tu área" con nombre, disparador y pasos.
- **Presupuesto:** si la sección supera 8 000 caracteres (~2 000 tokens), se recorta así: primero
  se quitan los pasos (quedan nombres); después, las áreas sin agentes habilitados; por último, se
  trunca la lista por orden de área (`sortOrder`). El recorte es determinista para el mismo estado.
- El mock del LLM (`llm/mock.ts`) aprende las palabras clave de `proyectos` y `operaciones` y
  devuelve `processKey` cuando la palabra clave coincide con un proceso del área.

## 6. API REST (prefijo `/api`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET / PATCH | `/company` | Perfil de la empresa (el PATCH es parcial). La zona horaria se valida con `Intl`. |
| GET / POST | `/areas` | Lista y alta. |
| PATCH / DELETE | `/areas/:id` | Edición parcial y baja (reglas de §4). |
| GET / POST | `/processes` | Lista (filtro opcional `?areaId=`) y alta. |
| GET / PATCH / DELETE | `/processes/:id` | Ficha, edición y baja. |
| GET / POST | `/recurring-tasks` | Lista (filtros `?agentId=`, `?processId=`) y alta. |
| PATCH / DELETE | `/recurring-tasks/:id` | Edición y baja. |
| POST | `/recurring-tasks/:id/run` | Lanzar ahora (§5.2). 201 con `TaskTree`. |
| POST | `/recurring-tasks/:id/skip` | Omitir una fecha. |
| GET | `/agenda` | Agenda del día (§5.4). |
| GET / POST | `/approval-policies` | Lista (filtro `?actionId=`) y alta. |
| PATCH / DELETE | `/approval-policies/:id` | Edición y baja. |

Cambios en rutas existentes: `GET /state` agrega `areas` y `tenant.profile`; `POST/PATCH /agents`
aceptan `areaId` y `reportsToAgentId`; `GET /tasks` devuelve los campos nuevos y admite
`?origin=recurring` y `?processId=`; `POST /action-runs/:id/approve` aplica la regla de nota.
Errores con el formato existente `{ error, details? }`: 400, 404 y 409.

Validación de entrada con los esquemas de `server/src/api/schemas.ts` (mismo estilo): claves con
`AGENT_KEY_PATTERN`, `code` con `^[A-Z]-[A-Z]{3}-\d{2}[a-z]?$` en recurrentes y
`^P-[A-Z]{3}-\d{2}$` en procesos, `time` con `^([01]\d|2[0-3]):[0-5]\d$`, límites de longitud
(nombres ≤ 80, textos ≤ 2 000, pasos ≤ 12, KPI ≤ 6, prefetch ≤ 3).

## 7. Eventos

Sin tipos nuevos (D-M10). El CRUD de §6 emite `config.changed`. La materialización emite
`task.created`, `delegation`, `agent.status` y `task.updated`, igual que una solicitud. El cliente
que quiera refrescar la agenda escucha `task.*`, `action.updated` y `config.changed`.

## 8. Seed `servicios-b2b` (bases nuevas)

Se carga desde PROCESOS.md:

| Elemento | Cantidad | Origen |
|----------|----------|--------|
| Perfil | 1 | §1: Servicios B2B, `America/Santiago`, CLP, lunes a viernes |
| Áreas | 8 | §3 |
| Agentes | CEO + 8 (claves existentes + `proyectos` y `operaciones`; `comunicaciones` reporta a `marketing`) | §3 |
| Acciones | Las 18 del MVP + 11 nuevas (`leer_bandeja` del CEO, `agendar_reunion_cliente`, `crear_proyecto`, `consultar_horas_proyecto`, `agendar_kickoff`, `enviar_encuesta`, `enviar_recordatorio_cobro`, `programar_pago` 🔒, `agendar_entrevista`, `gestionar_acceso` 🔒, `emitir_orden_compra` 🔒) | §5 |
| Procesos | 19 | §4–§5 |
| Recurrentes | 27: 11 de Dirección (R-DIR-01, 02, 03a, 03b, 04a, 04b, 04c, 05, 06, 07 y 08) y 16 de áreas (§7) | §6–§7 |
| Políticas | 4 (U-01…U-04) | §8.3 |

Las 11 acciones nuevas usan el conector `internal` (simulado). El seed es una función pura que
devuelve los datos y se puede probar sin base de datos.

## 9. Compatibilidad

- **Web y oficina 3D:** siguen leyendo `agent.area` (D-M02). La oficina 3D muestra 9 agentes de las
  11 plazas posibles. Ningún cambio de UI es obligatorio en este frente.
- **Pruebas existentes:** las que crean su propio store con agentes a mano no cambian. Las e2e que
  dependen del seed (`e2e.test.ts`) se revisan en M-07: el ruteo del mock con las claves históricas
  no debe cambiar, y los agentes nuevos solo responden a sus propias palabras clave.
- **Clientes viejos:** `AgentInput.area` (texto) sigue funcionando (§3).

## 10. Criterios de aceptación

1. **Migración:** una base creada con el store del MVP abre sin errores; quedan las áreas derivadas
   de `agent.area`, cada agente con `areaId`, ninguna fila perdida, y abrirla dos veces da el mismo
   resultado (prueba con base temporal en disco).
2. **Seed:** una base nueva tiene 8 áreas, 9 agentes, 29 acciones, 19 procesos, 27 recurrentes y
   4 políticas, todos con `tenant_id` del tenant demo.
3. **Ocurrencias:** pruebas de tabla de `occurrenceFor` para daily (solo hábiles), weekly, monthly
   por día del mes (31 en meses cortos), n-ésimo y último día hábil, y las dos fechas de cambio de
   horario de `America/Santiago` en 2026.
4. **Programador:** con reloj falso, un ciclo a las 08:31 materializa R-DIR-01 una sola vez aunque
   corran dos ciclos seguidos; una recurrente `manual` nunca se materializa sola; con
   `schedulerEnabled: false` no se materializa nada.
5. **Materialización:** una recurrente de un agente de área crea una raíz del CEO con exactamente una
   hija, sin llamada de planificación ni de síntesis al LLM; la del CEO pasa por planificación.
   Ambas guardan `origin = 'recurring'`, `recurringTaskId` y `occurrenceDate`.
6. **Contexto y prefetch:** R-DIR-01 recibe en sus instrucciones la salida de `leer_bandeja`; un
   prefetch que una política vuelve aprobable no se ejecuta y queda anotado.
7. **Políticas:** `enviar_propuesta` con `importe` 31 000 000 queda en `pending_approval` con
   `policyId` de U-01 y `requireNote = true`; aprobar sin nota da 400 y con nota funciona.
   `enviar_recordatorio_cobro` con `monto_adeudado` 5 000 000 se ejecuta sin aprobación y con
   25 000 000 la pide. Crear una política con `op: 'gt'` sobre un parámetro de texto da 400.
8. **Agenda:** para una fecha fija y un reloj falso, devuelve los estados `scheduled`, `due`,
   `running`, `done`, `skipped` y `missed` en un caso de prueba que los cubra todos.
9. **Prompts:** con el seed completo la sección de estructura queda en 8 000 caracteres o menos, y
   el recorte es determinista (mismo estado, mismo texto).
10. **Sin regresión:** `npm run typecheck` y `npm test` en verde, con la misma salvedad D-16 del
    EBUSY en Windows; el bundle web no crece por encima de su presupuesto (este frente no agrega
    código de UI).

## 11. Fuera de alcance y preguntas abiertas

- Aprobación de documentos o planes completos (PROCESOS Q2).
- Feriados (Q3): `workdays` cubre solo los días de la semana.
- Renombrar claves de agentes (Q1, D-M03).
- Varias instancias del servidor: el `UNIQUE` evita duplicados en una base compartida, pero con
  Postgres y varios workers hará falta un lock o una cola (se anota en `INTEGRATIONS.md` §5 en M-09).
- Recomendación estructurada del CEO por ejecución (un campo `advice` en `ActionRun`): queda para la
  implementación del HUD; en esta etapa la recomendación va en el texto del resultado de R-DIR-04.
