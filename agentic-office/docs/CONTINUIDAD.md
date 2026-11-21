# Prompt de continuidad — agentic-office (sesión local)

Copia todo lo que está bajo la línea en una sesión nueva de Claude Code abierta **en tu PC**, en
`C:\Users\moral\OneDrive\Documentos\repos\ai-agentic-team`. No hace falta trabajar en la nube.

---

Continúo agentic-office en local. Una sesión anterior en la nube trabajó sin acceso a mi rama
`ov2/integracion` (nunca la publiqué). Dejó todo en la rama remota `claude/nifty-gauss-2mf54k`, que
solo trae documentos y un prototipo y no toca código de la app. Tu trabajo es traer eso a local,
mostrarme el resultado y seguir con lo pendiente.

## Contexto

- **Rama de trabajo local:** `ov2/integracion`. Ahí están la Oficina v2 (T-01..T-17, 100 en su último
  ciclo) y la revisión 2.1 "Terraza". La rama no está publicada.
- **Documentos del plan anterior:** `agentic-office/docs/plan-oficina-v2/` (SPEC, PLAN, RUBRICA,
  PROTOCOLO, LOOP y ESTADO). Si vas a usar el mismo método, lee primero ESTADO.md y LOOP.md §6.
- **Estado de la SUITE en `ov2/integracion`:**
  - web: 327/327;
  - servidor: 75/76, con el fallo permitido D-16 (EBUSY de `server/test/store.test.ts` en Windows).
- **Bundle:** entrada 94 512 B de 101 812; diferido 172 409 B de 194 560.
- **Método de trabajo:**
  - Tú orquestas en Opus.
  - Los implementadores son subagentes con `model: "sonnet"` en worktree.
  - El challenger es un subagente nuevo por entrega, sin model (hereda Opus), con rúbrica de 85 o más.
  - Integras con `merge --no-ff`.
  - No haces push sin mi permiso.
  - Antes del challenger, el implementador hace `git merge` de la integración si otra tarea de la ola
    ya se integró.

## Qué dejó la sesión en la nube (rama `claude/nifty-gauss-2mf54k`)

La rama parte de `main` y solo trae commits de documentos; no contiene `ov2/integracion`.

| Commit | Contenido |
|--------|-----------|
| `7086f0f`, `1bd8b36`, `4aa3e17`, `c9a68fa`, `b530798` | Modelo de procesos, revisiones 0 a 4 |
| `25cb361`…`f552675` y merge `3e5a108` | Propuesta de diseño del HUD (H-01), revisiones 1 a 4 |

### Frente 1 — Modelo de procesos: `agentic-office/docs/modelo-procesos/`

- **Entrevista:** rubro servicios B2B; áreas redefinidas según el rubro; rutina del CEO con leer y
  triar correo, resolver pendientes, revisar tareas de agentes y aprobar ejecuciones; formato
  Markdown en el repo.
- **PROCESOS.md:** "Aster Consultores" (ficticia).
  - CEO + 8 agentes. Se conservan las claves del MVP (`ventas`, `marketing`, `comunicaciones`,
    `soporte`, `contabilidad`, `rrhh`) y se suman `proyectos` y `operaciones`. `comunicaciones` queda
    como apoyo de Marketing.
  - 8 áreas, 19 procesos `P-XXX-NN`, rutina diaria del CEO y 27 recurrentes `R-XXX-NN`.
  - Delegación y aprobación: principio "lo que sale de la empresa lo aprueba el Dueño", una sola
    excepción (U-03), umbrales U-01..U-05 en CLP y una regla de entrada no confiable para el correo y
    los mensajes entrantes.
  - RACI y etapas de escala: pyme, mediana y grupo.
- **SPEC.md (revisión 4):** decisiones D-M01..D-M20.
  - Entidades nuevas: `Area`, `Process`, `RecurringTask`, `TaskOccurrence`, `ApprovalPolicy` e
    `internal_requests`.
  - Campos nuevos en `Agent`, `ActionDef` (`sideEffect`), `Task` y `ActionRun`.
  - Agenda calculada (`GET /api/agenda`).
  - Programador idempotente con zona horaria, sin dependencias nuevas.
  - Políticas monótonas que fallan cerradas.
  - Seed `servicios-b2b` con tabla de acciones y parámetros.
  - Migración, API, criterios de aceptación y §12 con los cambios por revisión.
  - **Base de lectura:** el MVP de la rama remota `claude/ai-agents-template-saas-8y3ug9`, commit
    `eae8a53`, no `ov2/integracion`.
- **PLAN.md:** M-00..M-10 en 7 olas. M-00 es una puerta: verificar el SPEC contra `ov2/integracion`.
- **Challenger:** 70, 76, 83 y 83. Nunca llegó a 85, pero no quedó ningún bloqueante; cada ciclo
  encontró detalles más finos. **Recomendación de la sesión:** dar la etapa 0 por cerrada y que lo
  que quede lo atrapen M-00 y los challengers de cada tarea, sobre código real. **Lo decido yo.**

### Frente 2c — Propuesta del HUD del CEO: `agentic-office/docs/diseno-hud/`

- **Archivos:**
  - `prototipo-hud.html`: un solo archivo, sin dependencias, se abre directo en el navegador.
  - `DISENO-HUD.md`: sistema visual, módulos, mapeo de las pestañas actuales, transición,
    accesibilidad, bundle, riesgos y plan H-02..H-13.
  - `capturas/`: 4 PNG.
- **Módulos:**
  - 01 Procesos
  - 02 Áreas, con la ficha de cada agente y su CRUD
  - 03 Mi día, con la agenda R-DIR y "lo que ve y decide el Dueño"
  - 04 Agentes, con el árbol de tareas
  - 05 Ejecuciones y aprobaciones, con la regla de nota obligatoria
- **Navegación:** riel hexagonal, gauges y barra de solicitud fija.
- **Decisión que tomé:** el clic en un agente que no es el CEO abre el HUD en la ficha de ese agente.
- **Challenger:** 78, 82 y 81. Después hubo una ronda final acotada, que yo autoricé y que el
  orquestador verificó con Playwright:
  - el CEO queda encuadrado en la ventana despejada en 1920/1440/1024/390/320 px, con y sin
    movimiento reducido;
  - axe: 0 violaciones;
  - sin errores de consola y sin scroll horizontal;
  - Esc durante el dolly cancela la apertura;
  - la oficina se ve por la ventana despejada (19,7 % de píxeles cambian ahí) y los paneles son casi
    opacos por legibilidad.
- **Riesgos declarados:**
  - El HUD completo se estima en 15–18 KB gzip, con un presupuesto de 21,5 KiB repartido en 3 chunks
    diferidos. Se confirma con la prueba temprana en TSX (H-03b).
  - No se verificó con el 3D real ni con lectores de pantalla reales.
  - En el historial de la rama quedó una versión anterior de las capturas de unos 6,5 MB; las
    actuales pesan 557 KB.

### Lo que NO se hizo

- **2a.** Partículas de polvo (`web/src/office3d/effects/particles.ts`, `DUST_MAX = 200`, bloom de
  noche). Pendiente: quitarlas, o confinarlas a un haz y bajar su brillo de noche.
- **2b.** El haz ámbar de `waiting_approval` se ve como cilindros gruesos, y la altura de los orbes del
  CEO no se ajustó a los personajes ×1,6 (pendiente de T-13).
- **Implementación del modelo de procesos:** M-01 en adelante.

## Qué hacer, en orden

### 1. Traer la rama y mostrarme el resultado (sin tocar `ov2/integracion` todavía)

```
git fetch origin claude/nifty-gauss-2mf54k
git log --oneline ov2/integracion..FETCH_HEAD
git diff --stat ov2/integracion...FETCH_HEAD
```

Confirma que el diff solo trae archivos nuevos bajo `agentic-office/docs/modelo-procesos/`,
`agentic-office/docs/diseno-hud/` y este archivo. Después intégralo:

```
git checkout ov2/integracion
git merge --no-ff FETCH_HEAD -m "Integra modelo de procesos (etapa 0) y propuesta del HUD (H-01)"
```

**Muéstrame el prototipo:** ábrelo en el navegador con
`start agentic-office\docs\diseno-hud\prototipo-hud.html`, o con el panel del navegador. Recórrelo
conmigo:
- clic en el CEO (o Tab + Enter);
- los 5 módulos con las teclas 1–5;
- aprobar una ejecución con y sin nota;
- Esc;
- clic en otro agente.

Muéstrame también las capturas de `capturas/`. Quiero aprobar o ajustar la dirección visual antes de
implementar nada del HUD.

### 2. Corregir 2a y 2b (tarea corta, con el método de siempre)

Implementador Sonnet en worktree y challenger Opus.

- **2a:** quitar las partículas (recomendado; SPEC §10 de plan-oficina-v2 las pone primeras en la lista
  de recortes), o confinarlas a un solo haz con pocas unidades y un brillo de noche bajo el umbral del
  bloom. Actualiza las pruebas y la medición del bundle, que debería bajar.
- **2b:** el haz de `waiting_approval` debe ser fino y sutil, a la altura de los personajes ×1,6, y
  los orbes del CEO deben quedar sobre la cabeza escalada. Revisa también todo lo demás que dependa
  de la altura de los personajes.
- **Evidencia:**
  - SUITE verde (salvo D-16);
  - bundle dentro de presupuesto;
  - capturas de día y de noche con `?debug=1` y `window.__office3d.snapshot()`;
  - FPS medidos con el panel visible.

### 3. Decidir la etapa 0 del modelo de procesos y ejecutar M-00

- Pregúntame si la doy por cerrada o si quiero otro ciclo del challenger.
- Antes de la Ola 1, cierra conmigo las preguntas abiertas de PROCESOS.md:
  - Q1: renombrar claves históricas;
  - Q2: aprobación de documentos o planes;
  - Q3: feriados.
- **M-00 (orquestador, sin challenger):** compara con la base que usó el SPEC (MVP `eae8a53`) los
  archivos que lista SPEC §0, más `server/test/e2e.test.ts` y `server/test/store.test.ts`, tal como
  están en `ov2/integracion`.
  - Confirma qué lee la oficina 3D del agente (`web/src/office3d/`, `web/src/panels/`): ¿solo
    `agent.area`? ¿el tope de 10 agentes de área + CEO?
  - Revisa si el web construye literales de `Agent`, `Task` o `AgentInput` que se romperían en M-01
    o M-02.
  - Anota los desvíos en PLAN.md. Si alguno toca el contrato, corrige SPEC.md antes de M-01.
  - Deja el resultado en un ESTADO.md nuevo dentro de `docs/modelo-procesos/`.
- Luego sigue las olas del PLAN, con prueba de integración de ola, porque la e2e es intocable:

  | Ola | Tareas |
  |-----|--------|
  | 1 | M-01 |
  | 2 | M-02 ‖ M-03 |
  | 3 | M-04 ‖ M-07 |
  | 4 | M-05 |
  | 5 | M-06 ‖ M-09 |
  | 6 | M-08 |
  | 7 | M-10 |

### 4. HUD (cuando apruebe la dirección visual)

Sigue el plan de DISENO-HUD.md §10:
- empieza por H-03b, la prueba temprana en TSX para medir cuánto pesa React;
- el control de bundle por chunk en CI va en H-04.

Los módulos 01 y 03 dependen de la API del modelo de procesos (M-08): conviene implementar el HUD
después de la Ola 6, o con datos simulados detrás de la misma interfaz.

Preguntas abiertas para resolver:
- ¿El límite de 194 560 B del chunk diferido se mide sin comprimir o en gzip?
- Falta un endpoint o campo para listar `internal_requests`: hay que agregarlo al SPEC.

### 5. Pendientes de antes que siguen abiertos

- Decidir push de `ov2/integracion` o PR hacia `main`.
- Arreglar el EBUSY de `server/test/store.test.ts` en Windows. Ojo: el SPEC del modelo agrega
  pruebas nuevas con bases temporales y pide nombres únicos y cerrar cada base antes de borrarla.
- Limpiar los worktrees de `.claude/worktrees`. Los bloqueados se borran con
  `git worktree remove --force --force`.
- Opcional, antes del PR: limpiar del historial las capturas viejas de unos 6,5 MB del HUD
  (commit `f5d2457`).

## Gotchas

- El preview del panel inyecta PORT=5173; usa `.claude/launch.json`, que hace
  `cmd /c set PORT=8787`.
- Con el panel del navegador oculto, la página limita rAF (~30 FPS) o pausa la escena a propósito.
  Mide FPS con el panel visible y `?debug=1`.
- `read_console_messages` acumula errores viejos; los 502 son del arranque del servidor.
- En el Bash de este entorno los heredocs con comillas pueden fallar: usa Write más un script python.
- Si el SPEC del modelo dice algo del código que no calza con `ov2/integracion`, manda el código: es
  justo lo que debe atrapar M-00.
