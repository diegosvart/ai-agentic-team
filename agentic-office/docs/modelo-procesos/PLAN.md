# PLAN — Modelo de procesos (M-00…M-10)

Implementa [SPEC.md](SPEC.md). Método igual al de `plan-oficina-v2` (ver su LOOP.md §6):

- **Orquestador:** Opus. Integra con `merge --no-ff` en la rama de integración y no hace push sin
  permiso del usuario.
- **Implementadores:** subagentes Sonnet, cada uno en su worktree. Si otra tarea de la misma ola ya
  se integró, el implementador hace `git merge` de la integración antes de pasar al challenger.
- **Challenger:** subagente nuevo por entrega, en Opus. Usa la `RUBRICA.md` de `plan-oficina-v2`
  más los criterios de la tarea, y aprueba con **85 o más**. Bajo 85, la tarea vuelve con sus
  hallazgos; tras dos rechazos, se escala al usuario.
- **Evidencia mínima por tarea:** `npm run typecheck`, `npm test` (salvedad D-16: EBUSY de
  `server/test/store.test.ts` en Windows), las pruebas nuevas nombradas y el diff acotado a los
  archivos de la tarea.

## Etapa 0 — Documentos (esta entrega)

| Id | Entregable | Estado |
|----|------------|--------|
| E-01 | PROCESOS.md (empresa, áreas, procesos, rutina del CEO, delegación y aprobación) | Revisión del challenger |
| E-02 | SPEC.md (modelo, contrato, persistencia, comportamiento, API, aceptación) | Revisión del challenger |
| E-03 | PLAN.md (este archivo) | Revisión del challenger |

Las preguntas abiertas Q1–Q3 de PROCESOS.md se cierran con el usuario antes de la Ola 1.

## Olas

```
Ola 1: M-00 ─► M-01
Ola 2: M-02 ‖ M-03
Ola 3: M-05 ‖ M-07
Ola 4: M-04 ‖ M-06 ‖ M-09
Ola 5: M-08
Ola 6: M-10
```

M-04 y M-05 tocan `engine/index.ts`, por eso van en olas distintas. M-09 toca los prompts, en una
región separada del bucle de herramientas que toca M-04.

## Tareas

### M-00 · Verificar la base contra `ov2/integracion` (orquestador)
- Compara con la base de SPEC §0 los archivos `shared/src/index.ts`, `server/src/store/index.ts`,
  `server/src/store/seed.ts`, `server/src/engine/`, `server/src/api/`, `server/src/llm/mock.ts`,
  `server/test/e2e.test.ts` y `docs/INTEGRATIONS.md`.
- Revisa además qué lee la oficina 3D del agente (`web/src/office3d/`, `web/src/panels/`):
  confirma que solo usa `agent.area`, o lista qué más usa.
- Salida: lista de desvíos anotada en este PLAN; si alguno toca el contrato, corrige SPEC antes de M-01.
- Sin challenger (es una verificación); el resultado queda en ESTADO.md.

### M-01 · Contrato compartido
- Archivos: `shared/src/index.ts`.
- Agrega los tipos de SPEC §3 y los campos opcionales o anulables en `Tenant`, `Agent`,
  `AgentInput`, `Task`, `ActionRun` y `StateResponse`, más las constantes de los patrones de `code`
  y `time`.
- Criterio: el web y el servidor compilan **sin cambios** en su código (prueba de compatibilidad).

### M-02 · Store: tablas, migración y CRUD
- Archivos: `server/src/store/index.ts`, `server/src/contracts.ts` (interfaz `Store`) y
  `server/test/store-model.test.ts` (nuevo).
- Implementa SPEC §4: tablas, columnas nuevas, migración idempotente, CRUD de áreas, procesos,
  recurrentes, ocurrencias y políticas, reglas de borrado (409) y la sincronía de `agents.area`.
- Pruebas: criterio 1 de SPEC §10 (migración de una base del MVP, dos veces), CRUD, choque de
  `UNIQUE` en ocurrencias y cada regla de borrado.
- Ojo: crea las bases temporales con nombres únicos y ciérralas antes de borrarlas (es el origen
  del EBUSY de D-16; no lo empeores).

### M-03 · Calendario y zona horaria
- Archivos: `server/src/scheduler/calendar.ts` (nuevo) y `server/test/calendar.test.ts` (nuevo).
- Funciones puras `occurrenceFor(rec, localDate, profile)`, `zonedTimeToUtc(date, time, tz)`,
  `localDateOf(now, tz)` y `businessDaysOfMonth(...)`, sin dependencias nuevas (D-M15).
- Pruebas: criterio 3 de SPEC §10. Las fechas de cambio de horario de Chile en 2026 se obtienen
  con `Intl` dentro de la prueba, no se escriben a mano.
- El challenger revisa en especial los saltos de horario y los meses con menos días hábiles que n.

### M-05 · Motor: materialización, contexto y prefetch
- Archivos: `server/src/engine/index.ts`, `server/src/contracts.ts` (interfaz `Engine`) y
  `server/test/engine-scheduled.test.ts` (nuevo).
- Implementa SPEC §5.2 (`submitScheduled`), los campos `origin`, `processId`, `recurringTaskId` y
  `occurrenceDate` en las tareas, y `processKey` opcional en el plan.
- Pruebas: criterios 5 y 6, con el LLM simulado contando las llamadas de planificación y síntesis.

### M-07 · Seed `servicios-b2b` y mock del LLM
- Archivos: `server/src/store/seed.ts`, `server/src/llm/mock.ts`, `server/test/seed.test.ts`
  (nuevo) y, solo si hace falta, `server/test/e2e.test.ts`.
- Seed de SPEC §8 como función pura. Las bases nuevas lo cargan; las migradas, no.
- El mock aprende las palabras clave de `proyectos` y `operaciones`.
- Pruebas: criterio 2. Si una e2e cambia, el challenger exige justificar cada línea cambiada y
  comprobar que el ruteo de las claves históricas no se movió.

### M-04 · Políticas de aprobación
- Archivos: `server/src/engine/index.ts` (evaluación), `server/src/api/index.ts` (regla de nota en
  aprobar), `server/src/engine/validation.ts` y `server/test/policies.test.ts` (nuevo).
- Implementa SPEC §5.3 y la validación de políticas.
- Pruebas: criterio 7 completo, más el caso "parámetro ausente → la política no aplica".

### M-06 · Programador
- Archivos: `server/src/scheduler/index.ts` (nuevo), `server/src/config.ts`, `server/src/index.ts`
  (composition root) y `server/test/scheduler.test.ts` (nuevo).
- Implementa SPEC §5.1 con reloj inyectable, un ciclo al arrancar y apagado limpio (sin timers
  colgando en las pruebas).
- Pruebas: criterio 4. En `npm test` el programador queda apagado salvo en su propia prueba.

### M-09 · Prompts y guía de integraciones
- Archivos: `server/src/engine/` (armado del prompt), `server/src/llm/anthropic.ts` (esquema del
  plan con `processKey`), `server/test/prompt-structure.test.ts` (nuevo) y `docs/INTEGRATIONS.md`
  (§5: programador con varias instancias; §3: el correo entrante puede alimentar `leer_bandeja`).
- Implementa SPEC §5.5.
- Pruebas: criterio 9 (tope de 8 000 caracteres y recorte determinista).

### M-08 · API REST y agenda
- Archivos: `server/src/api/index.ts`, `server/src/api/schemas.ts` y `server/test/api-model.test.ts`
  (nuevo).
- Implementa SPEC §6 y §5.4, con los cambios a rutas existentes.
- Pruebas: criterio 8 y una prueba por ruta (éxito, 400, 404 y 409 donde aplique).

### M-10 · Cierre (orquestador)
- Suite completa, typecheck y bundle (sin crecimiento: este frente no agrega UI).
- Actualiza ESTADO.md y deja la lista de lo que necesitará el HUD (agenda, procesos, áreas,
  políticas y recomendación `advice` de SPEC §11).

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| `ov2/integracion` cambió el contrato | M-00 es una puerta: no se avanza sin conciliar. |
| Las e2e dependen del seed y del ruteo del mock | D-M03 (claves estables) y el control del challenger en M-07. |
| Errores de zona horaria | Funciones puras con pruebas de tabla y fechas obtenidas de `Intl` (M-03). |
| Costo de LLM de las recurrentes automáticas (13 a 16 por día hábil) | Agentes de área sin planificación ni síntesis (D-M05), `schedulerEnabled` por tenant y modo simulación por defecto sin API key. |
| EBUSY en Windows (D-16) | Pruebas nuevas con bases únicas y cerradas; el arreglo de fondo sigue como tarea aparte. |
