# PLAN — Modelo de procesos (M-00…M-10)

Implementa [SPEC.md](SPEC.md) (revisión 4). Método igual al de `plan-oficina-v2` (ver su LOOP.md §6):

- **Orquestador:** Opus. Integra con `merge --no-ff` en la rama de integración y no hace push sin
  permiso del usuario.
- **Implementadores:** subagentes Sonnet, cada uno en su worktree. Si otra tarea de la misma ola ya
  se integró, el implementador hace `git merge` de la integración antes de pasar al challenger.
- **Challenger:** subagente nuevo por entrega, en Opus. Usa la `RUBRICA.md` de `plan-oficina-v2`
  más los criterios de la tarea y aprueba con **85 o más**. Bajo 85, la tarea vuelve con sus
  hallazgos; tras dos rechazos, se escala al usuario.
- **Prueba de integración de ola:** al integrar cada ola, el orquestador corre la suite completa
  (incluida `e2e.test.ts`) antes de abrir la siguiente. Los fallos que solo aparecen al combinar
  tareas (p. ej. seed + políticas en la Ola 3) se detectan ahí.
- **Evidencia mínima por tarea:** `npm run typecheck`, `npm test` (salvedad D-16: EBUSY de
  `server/test/store.test.ts` en Windows), las pruebas nuevas nombradas y el diff acotado a los
  archivos de la tarea.

## Etapa 0 — Documentos

| Id | Entregable | Estado |
|----|------------|--------|
| E-01 | PROCESOS.md | Revisión 4 (ciclos: 70, 76, 83 y 83). Pendiente de decisión del usuario |
| E-02 | SPEC.md | Revisión 4 (cambios en SPEC §12) |
| E-03 | PLAN.md (este archivo) | Revisión 4 |

Las preguntas abiertas Q1–Q3 de PROCESOS.md se cierran con el usuario antes de la Ola 1.

## Olas

```
Ola 1: M-00 ─► M-01
Ola 2: M-02 ‖ M-03
Ola 3: M-04 ‖ M-07
Ola 4: M-05
Ola 5: M-06 ‖ M-09
Ola 6: M-08
Ola 7: M-10
```

- La regla de aprobación efectiva (M-04) llega **antes** del motor de recurrentes (M-05): este
  necesita evaluarla para el prefetch y para la regla de entrada no confiable.
- M-04 y M-07 no comparten archivos: M-04 toca el motor, la validación y la API; M-07 toca el seed,
  el mock y sus pruebas.
- M-06 y M-09 no comparten archivos: M-06 toca el programador, `config.ts`, `Config` en
  `contracts.ts` y el composition root; M-09 toca `llm/anthropic.ts`, `llm/mock.ts`, una línea del
  motor y la guía. Los cambios de interfaz del LLM los hace M-05, no M-09.

## Tareas

### M-00 · Verificar la base contra `ov2/integracion` (orquestador)
- Compara con la base de SPEC §0 los archivos que allí se listan, más `server/test/e2e.test.ts` y
  `server/test/store.test.ts`.
- Revisa qué lee la oficina 3D del agente (`web/src/office3d/`, `web/src/panels/`). Confirma que
  solo usa `agent.area` y el tope de 10 agentes de área + CEO, o lista qué más usa.
- Salida: los desvíos, anotados aquí. Si alguno toca el contrato, se corrige el SPEC antes de M-01.
- Sin challenger (es una verificación); el resultado queda en ESTADO.md.

### M-01 · Contrato compartido
- Archivos: `shared/src/index.ts`.
- Tipos de SPEC §3. Los campos nuevos de tipos existentes van **opcionales**, y `AgentInput.area`
  sigue requerido (pasa a opcional en M-08).
- Agrega las constantes de patrones.
- Criterio: el web y el servidor compilan **sin cambios** en su código.

### M-02 · Store: tablas, migración y CRUD
- Archivos:
  - `server/src/store/index.ts`;
  - `server/src/contracts.ts`: interfaz `Store` completa según SPEC §4 (`createTask`, `updateTask`,
    `createActionRun` y `updateActionRun` ampliados; `materializeOccurrence`,
    `relaunchOccurrence`, `listTenants`, filtros de `listRootTasks`, CRUD nuevo y pedidos internos);
  - `shared/src/index.ts`: los campos que pasan a requeridos;
  - `server/test/api.test.ts`: solo el literal del CEO que deja de compilar al volver requerido
    `Agent.areaId` (el resto del doble se adapta en M-08);
  - `server/test/store-model.test.ts` (nuevo);
  - adaptación sin cambiar aserciones de `server/test/engine.test.ts` (incluido el doble
    `createMemoryStore` con los métodos nuevos), `server/test/llm-mock.test.ts` y
    `server/test/connectors.test.ts` (SPEC §9).
- Implementa SPEC §4:
  - tablas y columnas;
  - migración idempotente;
  - CRUD de áreas, procesos, recurrentes, ocurrencias y políticas;
  - reglas de borrado y de edición (409);
  - sincronía de `agents.area`.
- Al terminar, en los tipos de respuesta de `shared` pasan a requeridos los campos que el store ya
  completa.
- Pruebas:
  - criterio 1 de SPEC §10;
  - el CRUD;
  - el choque de `UNIQUE` en ocurrencias (`materializeOccurrence` devuelve `null` sin efectos);
  - cada regla de la tabla de borrado.
- Ojo: bases temporales con nombre único y cerradas antes de borrarlas (es el origen del EBUSY de
  D-16).

### M-03 · Calendario y zona horaria
- Archivos: `server/src/scheduler/calendar.ts` (nuevo) y `server/test/calendar.test.ts` (nuevo).
- Funciones puras:
  - `occurrenceFor(rec, localDate, profile)`;
  - `zonedTimeToUtc(date, time, tz)`;
  - `localDateOf(now, tz)`;
  - `businessDaysOfMonth(...)`;
  - `businessHoursBetween(a, b, profile)` (para la urgencia, con `workHours`).
- Pruebas: criterio 3, y `businessHoursBetween` cruzando un fin de semana.
- El challenger mira en especial los saltos de horario y los meses sin el n-ésimo día hábil.

### M-04 · Aprobación efectiva y políticas
- Archivos:
  - `server/src/engine/approval.ts` (nuevo): función pura `effectiveApproval(action, params,
    policies, untrustedInput)`;
  - `server/src/engine/index.ts`: uso de esa función en el bucle de herramientas y la regla de nota
    en `resolveApproval`;
  - `server/src/engine/validation.ts`: validación de políticas;
  - `server/src/api/index.ts` y `server/src/api/schemas.ts`: `sideEffect` en acciones e
    `invalid: 400` en `CODE_STATUS` para el error de nota;
  - `server/test/policies.test.ts` (nuevo).
- Implementa SPEC §5.3 y D-M17. La parte de "árbol no confiable" se prueba con una raíz marcada a
  mano.
- Pruebas: criterio 7 sobre el motor y la función de validación (el 400 HTTP de "`gt` sobre texto"
  se prueba en M-08, cuando existan las rutas de políticas), más:
  - parámetro ausente → aplica (con una acción de prueba de parámetro opcional);
  - `untrustedInput` + `external` → aplica con `approvalSource = 'untrusted_input'`.

### M-07 · Seed `servicios-b2b` y mock del LLM
- Archivos:
  - `server/src/store/seed.ts`;
  - `server/src/store/index.ts`: solo `seedIfEmpty` y `SeedHost`, para cargar el seed nuevo;
  - `server/test/store.test.ts`: solo las aserciones del seed (SPEC §9);
  - `server/src/llm/mock.ts`: ruteo de D-M16, solo la parte de selección de agentes;
  - `server/test/seed.test.ts` (nuevo);
  - `server/test/mock-routing.test.ts` (nuevo).
- El seed de SPEC §8 es una función pura. Las bases nuevas lo cargan; las migradas, no.
- Pruebas: criterio 2 y las pruebas doradas del criterio 10, que fijan agentes, acciones y parámetros.
- **`e2e.test.ts` no se modifica.** Si falla, se ajusta el seed o los sinónimos.

### M-05 · Motor: materialización, contexto y prefetch
- Archivos:
  - `server/src/engine/index.ts`: `materializeScheduled`, `startScheduled`, `synthesis` respetado
    en `refreshRoot`, la síntesis y la recuperación, y `origin` en `submitRequest`;
  - `server/src/contracts.ts`: interfaz `Engine` (`startScheduled(tenantId, rootId)`, opción
    `schedulerActive` en `createEngine`) y entradas opcionales de `LLMProvider` según SPEC §5.5
    (`plan`, `startConversation`, `step` y `synthesize`; `PlannedSubtask.processKey`);
  - `server/src/llm/anthropic.ts` y `server/src/llm/mock.ts`: solo aceptar las entradas nuevas
    (el formato lo da M-09);
  - `server/test/engine-scheduled.test.ts` (nuevo).
- Implementa SPEC §5.2, la recuperación de §5.1 dentro de `Engine.recover(tenantId)` (el bucle por
  tenants va en el composition root, en M-06), el paso de `areaProcesses`, D-M19
  (`allowDelegation`), D-M20 (extracción, entrega única y consumo de pedidos internos) y la marca
  de raíces `inbound`. El `context` llega al LLM como entrada separada: M-05 pasa el campo y M-09 le da
  formato.
- Pruebas: criterios 5 y 6, con el LLM simulado contando las llamadas de planificación y síntesis.
  Incluye el caso con aprobación y reinicio, y el de reinicio después de crear la hija pasante.

### M-06 · Programador
- Archivos: `server/src/scheduler/index.ts` (nuevo), `server/src/config.ts`, `Config` en
  `server/src/contracts.ts` (campos nuevos **opcionales**, para no romper los literales de
  `engine.test.ts` y `llm-mock.test.ts`), `server/src/index.ts` (composition root) y
  `server/test/scheduler.test.ts` (nuevo).
- Implementa SPEC §5.1 (salvo la recuperación, que es de M-05) y D-M18, con el orden de arranque
  de §5.1 y el predicado `schedulerActive` conectado a la configuración:
  - reloj inyectable;
  - un ciclo al arrancar;
  - tope de 2 h;
  - apagado limpio, sin timers colgando en las pruebas.
- Pruebas: criterio 4.

### M-09 · Prompts, contexto no confiable y guía
- Archivos:
  - `server/src/llm/anthropic.ts`: `buildPlanSystem` y `buildAgentSystem` con la estructura,
    `processKey` en el esquema del plan y los bloques `<datos_no_confiables>` y
    `<pedidos_internos>`;
  - `server/src/llm/mock.ts`: devuelve `processKey`;
  - `server/src/engine/index.ts`: solo para pasar `structure` al LLM (`areaProcesses` ya lo pasa
    M-05);
  - `server/test/prompt-structure.test.ts` (nuevo);
  - `docs/INTEGRATIONS.md`: §3 con `origin: 'inbound'` y `leer_bandeja`; §5 con el programador en
    varias instancias.
- Implementa SPEC §5.5 y la entrega al LLM de §5.2.
- Pruebas: criterio 9, más:
  - una etiqueta de cierre (`</datos_no_confiables>` o `</pedidos_internos>`) dentro del contexto
    queda neutralizada;
  - en una raíz `inbound`, la hija y la síntesis reciben el texto entrante envuelto;
  - las pruebas doradas de M-07 siguen verdes.

### M-08 · API REST y agenda
- Archivos: `server/src/api/index.ts`, `server/src/api/schemas.ts`, `server/src/agenda.ts` (nuevo,
  cálculo puro de la agenda), `server/test/api-model.test.ts` (nuevo) y la adaptación del doble de
  `server/test/api.test.ts` (SPEC §9).
- Implementa SPEC §6 y §5.4, con los cambios a rutas existentes y la compatibilidad de agentes de §3.
- Pruebas: criterio 8, una prueba por ruta (éxito, 400, 404 y 409 donde aplique) y los casos de
  `area` y `areaId` de §3.

### M-10 · Cierre (orquestador)
- Suite completa, typecheck y bundle (sin crecimiento: este frente no agrega UI).
- Actualiza ESTADO.md con lo que necesitará el HUD: agenda, procesos, áreas, políticas, urgencia y
  `advice` (SPEC §11).

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| `ov2/integracion` cambió el contrato | M-00 es una puerta: no se avanza sin conciliar. |
| El seed nuevo cambia el ruteo del mock | D-M16, pruebas doradas y `e2e.test.ts` intocable (M-07). |
| Errores de zona horaria | Funciones puras con pruebas de tabla y fechas obtenidas de `Intl` (M-03). |
| Costo de LLM de las recurrentes automáticas (13 a 18 por día hábil) | Agentes de área sin planificación ni síntesis (D-M05), `SCHEDULER_LIVE` apagado por defecto (D-M18), tope de 2 h y `schedulerEnabled` por tenant. |
| Inyección de instrucciones por correo | D-M17 y el bloque de datos no confiables (M-04, M-09). |
| EBUSY en Windows (D-16) | Pruebas nuevas con bases únicas y cerradas; el arreglo de fondo sigue como tarea aparte. |
