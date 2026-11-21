# H-01 · Propuesta de diseño del HUD del CEO

Estado: propuesta de diseño, revisión 2. No se modificó el código de la app. Prototipo: [`prototipo-hud.html`](./prototipo-hud.html) (un solo archivo, sin dependencias; ábrelo directo en el navegador). Todos los datos son ficticios (empresa "Aster Consultores", consultora B2B de unas 30 personas) y siguen el seed `servicios-b2b` (SPEC §8) y PROCESOS.md de la revisión 1 del modelo de procesos: 9 agentes (CEO y 8 más, con `comunicaciones` como apoyo de Marketing), 8 áreas, 19 procesos `P-XXX-NN`, 27 recurrentes `R-XXX-NN` y las políticas U-01 a U-05.

## 1. Objetivo y alcance

**Objetivo.** Reemplazar el panel derecho de pestañas (Actividad, Aprobaciones, Equipo, Acciones) y la ficha del agente por un centro de mando tipo HUD de ciencia ficción que aparece sobre la oficina 3D cuando haces clic en el CEO: la cámara se aleja y el HUD se ensambla encima, con fondo traslúcido que deja ver la oficina.

**Dentro del alcance.** Sistema visual, anatomía, cinco módulos, mapeo de funciones actuales, navegación y atajos, secuencia de transición, accesibilidad, presupuesto de bundle, riesgos y plan de implementación.

**Fuera del alcance.** Implementación en React, cambios en el servidor o en `shared`, y cualquier cambio en el código 3D (que no está en este checkout). Todo lo que toque el código 3D se marca como **punto de integración a verificar**.

**Capturas** (2x, PNG de 256 colores: 120, 193, 169 y 79 KB, unos 560 KB en total; los colores de los agentes se conservan):

| Captura | Archivo |
|---|---|
| Oficina antes del clic | [`capturas/01-oficina-antes.png`](./capturas/01-oficina-antes.png) |
| HUD abierto (1440×900) | [`capturas/02-hud-abierto.png`](./capturas/02-hud-abierto.png) |
| Módulo 05, aprobaciones | [`capturas/03-aprobaciones.png`](./capturas/03-aprobaciones.png) |
| Vista móvil (390 px) | [`capturas/04-movil.png`](./capturas/04-movil.png) |

## 2. Sistema visual

### 2.1 Color (tokens CSS)

| Token | Valor | Uso |
|---|---|---|
| `--solid` / `--panel` | `#061834` / `rgba(5,20,46,.78)` | Fondo de los paneles grandes (barra superior, riel, módulo, resumen, barra de solicitud). Al 78 % deja ver la oficina detrás con un desenfoque de solo 3 px; el texto que va directo sobre ellos se mide en el peor caso (sección 7). |
| `--panel-2` | `rgba(11,36,72,.95)` | Tarjetas y bloques con texto: casi opacos |
| `--line` / `--line-dim` | `#2fd4f5` / `rgba(47,212,245,.40)` | Línea de neón fina (1 px) y bordes |
| `--accent` | `#35e0ff` | Elemento activo, números, relleno de gauges |
| `--on-accent` | `#03121f` | Texto sobre fondo accent |
| `--text` / `--dim` | `#e8f7ff` / `#a8c8dd` | Texto principal / secundario |
| `--ok` `--warn` `--bad` `--info` | `#5be3a4` `#ffcf5c` `#ff8f9c` `#8cc0ff` | Estados. Nunca van solos: siempre llevan icono y texto. |
| `--focus` | `#ffffff` (oscuro sobre fondos accent) | Anillo de foco |
| Velo del HUD | `radial-gradient(ellipse at 44% 22%, transparente → rgba(2,8,22,.5))` | Deja despejada la ventana de la oficina y oscurece los bordes |

### 2.2 Tipografía (solo del sistema)

- Texto: `system-ui, "Segoe UI", Roboto, …`, 15 px base, 13 px secundario, 12 px mínimo (badges y etiquetas del riel).
- Números, claves y rótulos técnicos: `ui-monospace, SFMono-Regular, Menlo, Consolas`, con `letter-spacing` de .12–.2em en mayúsculas para los rótulos.
- Sin fuentes web, para no costar bytes ni red.

### 2.3 Grosores y formas

- Líneas de neón: 1 px (bordes de panel y tarjeta), 1.5 px (marco del HUD y reglas), 2 px (foco), 6 px (arco de gauge).
- **Esquina recortada** con `clip-path`: `polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut))`. `--cut` vale 16 px en paneles, 10 px en tarjetas y 9 px en botones.
- **Borde sobre forma recortada.** `clip-path` no dibuja borde. Se usa un `::before` con `padding:1px` y una máscara `content-box`/`exclude`, más un `::after` con dos degradados diagonales para la línea de las esquinas cortadas.
- **Hexágono** (riel): `polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)`, 52×58 px (40×45 en móvil).

### 2.4 Estados

| Estado | Panel/tarjeta | Botón | Hexágono del riel | Chip de filtro |
|---|---|---|---|---|
| Reposo | línea tenue | fondo azul medio | borde cian, relleno `--solid`, número cian | borde tenue |
| Hover | sin cambio | fondo azul más claro | relleno más claro | fondo más claro |
| Foco (`:focus-visible`) | n/a | anillo 2 px **interior** (`outline-offset:-5px`, porque el recorte cortaría uno exterior) | anillo 2 px sobre el botón completo (no está recortado) | anillo exterior 2 px |
| Activo / seleccionado | n/a | desplazamiento 1 px al presionar | relleno `--accent`, número oscuro, etiqueta blanca | relleno `--accent` |
| Deshabilitado | n/a | opacidad .5 y cursor `not-allowed` | n/a | n/a |

Variantes de botón: primario (relleno accent), peligro (rojo oscuro), fantasma, tamaño `sm`.

Campos (`textarea`, `input`, `select`): borde de 1 px con `--line` (no la línea tenue), placeholder `#a8c8dd` con `opacity:1` y etiqueta siempre visible (la barra de solicitud al CEO la muestra encima del campo).

### 2.5 Movimiento

Un solo easing, `cubic-bezier(.2,.75,.2,1)`. Dolly de 800 ms, paneles de 600 ms con escalonado de 80 ms, líneas dibujadas en 900 ms, cierre de 280 ms más escalonado. Los pulsos (anillo del CEO, punto de "Simulación") son lo único cíclico, y se apagan con movimiento reducido.

## 3. Anatomía del HUD

```
┌───────────────────────────── Barra superior (panel 0) ──────────────────────────────┐
│ CENTRO DE MANDO · Empresa    fecha simulada   [● SIMULACIÓN] [Cerrar ✕]             │
├──────┬────────────────────────────────────────────────────┬─────────────────────────┤
│ Riel │ ┌ ─ ─ ─ ─  Ventana despejada: la oficina con ─ ─ ─ ┐ │ Resumen (4 gauges)      │
│ 01   │   el CEO encuadrado (sin panel, solo esquinas)       │  ◯ Tareas activas       │
│ 02   │ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │  ◯ Aprobaciones pend.   │
│ 03   ├────────────────────────────────────────────────────┤  ◯ Ejecuciones de hoy   │
│ 04   │  Módulo activo (tabpanel, scroll interno)           │  ◯ % completado         │
│ 05   ├────────────────────────────────────────────────────┤ Actividad 12 h (spark)  │
│      │  Solicitud para el CEO  [campo]  [Enviar al CEO]    │                         │
└──────┴────────────────────────────────────────────────────┴─────────────────────────┘
```

- Rejilla de escritorio: columnas `108px | 1fr | 292px` y filas `auto | 22vh (mín. 120 px) | 1fr | auto`. La fila 2 es la **ventana despejada**: sin panel, con cuatro esquinas y un rótulo, y es donde el dolly encuadra al CEO. Medido a 1440×900: el CEO queda en (634, 190) px, dentro de la ventana (146–1110 × 96–294). El resto de la oficina se ve además entre paneles y a través de los paneles grandes (78 %). Escalonado de entrada: topbar (0), riel (1), módulo (2), resumen (3), barra de solicitud (4).
- **Móvil (≤860 px)**: una columna con scroll vertical. Barra superior pegajosa arriba, gauges en rejilla de 2×2 sobre el módulo, módulo, barra de solicitud, y riel como barra inferior pegajosa en horizontal. Se oculta la sparkline y la fecha.
- **Gauges.** Cada uno es un anillo SVG decorativo (`aria-hidden`) más un número visible y dos textos reales: etiqueta ("Tareas activas") y equivalente textual ("11 de 19 tareas"). Definiciones: activas = tareas en cola, planificando, en curso o esperando aprobación; pendientes = ejecuciones en `pending_approval`; ejecuciones de hoy = todas las `ActionRun` del día; % completado = tareas `completed` / total.

### 3.1 Módulos

| # | Módulo | Contenido | Interacción |
|---|---|---|---|
| 01 | Procesos y tareas | Chips por área (filtro, `aria-pressed`) y las 19 tarjetas de proceso (`Process`): código `P-XXX-NN`, tipo (estratégico, operativo, soporte), dueño, disparador y sus recurrentes (`RecurringTask`: código `R-XXX-NN`, automática o manual, frecuencia `daily`/`weekly`/`monthly` con su hora). Los procesos que se activan por evento muestran "Sin tareas recurrentes". | Filtrar por área. En el prototipo es solo lectura. |
| 02 | Áreas de la compañía | Rejilla de 8 áreas: líder, estado, tareas activas y sparkline. **Área**: misión y lista de **todos** sus agentes (líder y apoyo; Marketing muestra a Lumen y a Eco), cada uno con "Abrir ficha", "Editar" y "Borrar". **Ficha del agente**: clave del agente (p. ej. `ventas`), área, rol, estado, modelo, acciones con su CRUD (efecto, aprobación 🔒 y política) y actividad reciente. "Nuevo agente" abre un formulario con un **selector de área** (`areaId`); sin área muestra el error y no crea el agente. Al final, la lista **Agentes deshabilitados o sin área**. | "Abrir área", "Abrir ficha" y "Volver" (el foco vuelve al control de origen); habilitar o deshabilitar al agente. |
| 03 | Tareas del día del CEO | Agenda simulada del martes 24 nov 2026, 13:10: las **8 rutinas R-DIR del día** (01, 02, 04a, 03a, 04b, 03b, 04c, 05) con estado `AgendaStatus`; un grupo "Manuales y fallidas de las áreas" (R-MKT-02 manual `due`, R-CLI-01 `failed`, R-PRY-01 `done`); y "Atrasadas" de días anteriores (R-DIR-05 `missed` del lunes 23, R-PER-02 manual `due` del viernes 20). Barra de avance y fila "Aprobar ejecuciones pendientes: N". | "Lanzar ahora" (por lanzar y perdidas), "Relanzar" (fallidas), "Omitir" (atrasadas). "Ir a aprobaciones" salta al módulo 05. |
| 04 | Tareas de los agentes | Árbol solicitud → subtareas, con agente, estado (icono + texto) y ejecuciones asociadas. Leyenda de estados. | Expandir/contraer con botones `aria-expanded`. |
| 05 | Ejecuciones y aprobaciones | Bandeja de pendientes, con las urgentes primero (`urgent`, `businessHoursWaiting`): acción, parámetros, **por qué pide aprobación** (`approvalSource`: acción 🔒, política `policyId` o entrada no confiable) y nota opcional u obligatoria (`requireNote`). Historial del día con nota y error. Casos del prototipo: `emitir_factura` por $18.400.000 CLP con U-02 y nota obligatoria; `enviar_recordatorio_cobro` por $24.500.000 con U-03 sin nota obligatoria; `gestionar_acceso` por acción 🔒; y un `enviar_recordatorio_cobro` de $3.200.000 urgente por `untrusted_input` (nace de R-DIR-01, que lee el correo). | Resolver en memoria: actualiza contadores, gauges, árbol y estado del agente, y mueve el foco a la siguiente tarjeta. Aprobar sin nota cuando es obligatoria muestra el error, mantiene la tarjeta y enfoca la nota. |

## 4. Mapeo de lo actual a los módulos nuevos

Cada fila se verificó contra `web/src/panels/` de la copia de solo lectura del MVP (`ActivityPanel`, `ApprovalsPanel`, `TeamPanel`, `ActionsPanel`, `AgentDetail`, `RequestBar`).

| Hoy | Función | Dónde queda |
|---|---|---|
| Pestaña **Actividad** | Árbol de la solicitud con sus subtareas, estado, modelo, complejidad y resultado | **04** Tareas de los agentes. Cada nodo se expande para ver detalle (modelo, complejidad, resultado, error, ejecuciones). Los badges de modelo y complejidad pasan al detalle del nodo. |
| Pestaña **Aprobaciones** | Bandeja con aprobar/rechazar y nota opcional (`ApprovalsPanel` no tiene historial) | **05** Ejecuciones y aprobaciones, con el mismo flujo, más la nota obligatoria cuando `requireNote` es verdadero (SPEC §5.3). El historial del día es **nuevo**: se deriva de `GET /api/tasks` (ver 4.1). El contador de pendientes pasa a un distintivo sobre el hexágono 05 y al gauge. |
| Pestaña **Equipo** | Lista de agentes (también los deshabilitados, con su distintivo); alta, edición y borrado (con confirmación) de agentes; estado y modelo | **02** Áreas: el área lista a **todos** sus agentes (líder y apoyo), y la sección "Agentes deshabilitados o sin área" conserva a los que hoy aparecen con el distintivo "Deshabilitado". "Nuevo agente" va en la cabecera y pide `areaId` con un selector. "Editar agente" y "Borrar agente" van en cada fila y en la ficha. El formulario de agente (`AgentForm`) y la confirmación de borrado se reutilizan, dentro del módulo. |
| Pestaña **Acciones** | Lista y CRUD de acciones: parámetros, enum, conector, requiere aprobación, habilitada | **02**, en la ficha del agente dueño: sección "Acciones" con "Nueva acción", "Editar" y "Borrar" por fila. El formulario completo (`ActionForm`) se reutiliza. |
| **Ficha del agente** (`AgentDetail`) | Estado, acciones, tareas y ejecuciones recientes | **02**, vista de ficha del agente (se llega desde su área o desde la lista de deshabilitados/sin área). Se agrega el atajo "ver sus tareas" hacia 04 (a definir en implementación). |
| **Barra de solicitud al CEO** (`RequestBar`) | Escribir una solicitud y enviarla, con ejemplos | Queda **fija en la parte inferior del HUD**, visible en todos los módulos (Enter envía, Shift+Enter agrega línea). Al enviar, la solicitud aparece en 04. Los ejemplos se muestran como sugerencias cuando el campo está vacío y recibe foco. |
| Selección de agente en la oficina (hover/tooltip/clic sobre personajes) | Abre la ficha | Se conserva. El clic en el CEO abre el HUD. El clic en otro personaje puede abrir el HUD directo en la ficha de su área (**punto de integración a verificar**). |
| Tiempo real (SSE `/api/events`) | Actualiza actividad y aprobaciones | Los mismos datos alimentan 04, 05 y los gauges. El prototipo usa estado en memoria. |

Funciones nuevas (no existen hoy en el MVP): módulo 01 Procesos y tareas recurrentes, y módulo 03 Tareas del día del CEO. Ya tienen modelo y API en el SPEC del modelo de procesos ([`../modelo-procesos/SPEC.md`](../modelo-procesos/SPEC.md); procesos en [`PROCESOS.md`](../modelo-procesos/PROCESOS.md)):

### 4.1 Fuentes de datos por módulo

| Módulo | Datos | Tipos (SPEC §3) | Endpoints (SPEC §6) |
|---|---|---|---|
| 01 Procesos y tareas | Procesos por área y sus tareas recurrentes (código, modo manual/automático, hora, frecuencia) | `Process`, `RecurringTask` | `GET /api/processes` (filtro `?areaId=`), `GET /api/recurring-tasks` (filtros `?agentId=`, `?processId=`). Acciones "Lanzar ahora" y "Omitir": `POST /api/recurring-tasks/:id/run` y `/skip`. |
| 02 Áreas | Área, agentes (líder y apoyo) y su estado; fichas de agente y sus acciones | `Area` (`StateResponse.areas`), `Agent` (con `areaId` y `reportsToAgentId`), `ActionDef` (con `sideEffect`) | `GET /api/state`, `GET/POST /api/areas`, `PATCH/DELETE /api/areas/:id`, `POST/PATCH /api/agents`, `DELETE /api/agents/:id`, `POST/PATCH/DELETE /api/actions` (`/actions/:id` en PATCH y DELETE) |
| 03 Tareas del día del CEO | Vista calculada de la agenda: las ocho rutinas R-DIR del día (R-DIR-01, 02, 03a, 03b, 04a, 04b, 04c y 05, PROCESOS §6.1), más las manuales y fallidas de las áreas y las atrasadas | `AgendaResponse`, `AgendaItem`, `AgendaStatus` (`scheduled`, `due`, `running`, `waiting_approval`, `done`, `failed`, `skipped`, `missed`) | `GET /api/agenda?date=AAAA-MM-DD` (§5.4); `POST /api/recurring-tasks/:id/run` y `/skip` |
| 04 Tareas de los agentes | Árbol solicitud → subtareas | `Task` (con `?origin=recurring` y `?processId=`), `ActionRun` | `GET /api/tasks`, SSE `/api/events` |
| 05 Ejecuciones y aprobaciones | Bandeja e historial; política que aplicó, origen de la aprobación, urgencia y si exige nota | `ActionRun` (`approvalSource`, `policyId`, `requireNote`, `resolvedBy`), `ApprovalPolicy` (U-01 a U-05, con `conditions` AND), `AgendaResponse.pendingApprovals` (`urgent`, `businessHoursWaiting`) | `GET /api/approvals`, `POST /api/action-runs/:id/approve` (400 si `requireNote` y la nota viene vacía o con solo espacios) y `POST /api/action-runs/:id/reject` (no exige nota, SPEC §5.3); `GET/POST /api/approval-policies` |

Consecuencias de diseño:

- El módulo 03 **no** es una checklist que el humano marca: es la agenda calculada, con estados de `AgendaStatus`. Las R-DIR son **automáticas**: el programador las lanza a su hora y, hasta 2 horas después de vencida, siguen `scheduled`. Por eso `due` solo aparece con una recurrente **manual** (R-MKT-02, R-FIN-04, R-PER-02) o con una automática que el programador ya no tomará. Una automática de un día anterior sin ocurrencia es `missed` y **solo** se muestra en "Atrasadas".
- **"Lanzar ahora"** sobre una `missed` o `due` de un día anterior llama a `POST /api/recurring-tasks/:id/run` con `{ date }` igual a la fecha de **esa** ocurrencia (por ejemplo `2026-11-23`), no a la de hoy. **"Relanzar"** una `failed` también es posible: el mismo endpoint crea una raíz nueva y la ocurrencia pasa a apuntarla (SPEC §5.2; en los demás casos responde 409). **"Omitir"** llama a `POST /api/recurring-tasks/:id/skip` con `{ date }`.
- El módulo 05 exige nota para **aprobar** cuando `requireNote` es verdadero y no para rechazar. `requireNote` es el OR de las políticas que aplicaron: U-02 la exige y U-03 no.
- La bandeja muestra el motivo (`approvalSource`, en el orden acción, política, entrada no confiable) y ordena primero las urgentes (`urgent = businessHoursWaiting > 9`). Ordenar por urgencia es una decisión de diseño: el SPEC no define el orden de la bandeja.
- **Historial y gauge "Ejecuciones de hoy".** No existe un endpoint por día: se derivan de `GET /api/tasks`, donde cada `TaskTree` trae `actionRuns` (SPEC §3; las del día se filtran por `createdAt`/`resolvedAt`, a verificar). El historial del día es una vista nueva, porque `ApprovalsPanel` no lo tiene.

Lo que el prototipo **no** reimplementa: los formularios completos de agente y de acción, ni el borrado real. Sus botones "Editar" y "Borrar" solo anuncian "aquí se abriría el formulario". "Nuevo agente" sí tiene su selector de área, para mostrar que `areaId` es obligatorio. El agente de ejemplo "Pliego" (deshabilitado y sin área) **no forma parte del seed**: está para mostrar ese estado. La regla real de cuándo se puede borrar un agente es una pregunta abierta.

## 5. Navegación y atajos de teclado

Riel de módulos: `role="tablist"` con `aria-orientation` vertical en escritorio y horizontal en móvil. Cada `role="tab"` tiene `aria-controls`, `aria-selected` y `aria-keyshortcuts`. Usa **roving tabindex**: solo la pestaña activa está en el orden de Tab.

| Tecla | Efecto |
|---|---|
| `Tab` / `Shift+Tab` | Recorre los controles del HUD. El foco queda atrapado dentro del diálogo. |
| `↑` `↓` (también `←` `→`) | Cambia de módulo con activación automática y envuelve en los extremos |
| `Home` / `End` | Primer / último módulo |
| `1`–`5` | Salta al módulo y enfoca su pestaña. Solo actúa con el foco en el riel de módulos o dentro del módulo activo, y nunca en un campo de texto, lista desplegable o casilla de escritura. |
| `Enter` / `Espacio` | Activa botones y casillas |
| `Enter` en la barra de solicitud | Envía. `Shift+Enter` agrega línea. |
| `Esc` | Cierra el HUD y devuelve el foco al CEO. Los borradores (notas de aprobación y solicitud al CEO) se **conservan** y se avisa; al reabrir siguen ahí. |

**Por qué los atajos 1–5 se limitan al riel y al módulo (WCAG 2.1.4, atajos de teclado con caracteres).** Un atajo de una sola tecla debe poder desactivarse, reasignarse o activarse solo con el foco en el componente. Aquí se cumple lo último: las teclas no hacen nada con el foco en la barra superior, en el resumen o en la barra de solicitud, ni al escribir en cualquier campo. Se verificó que `2` escrito en la barra de solicitud se queda como texto y que `3` con el foco en "Cerrar" no cambia de módulo.

Desde el CEO: `Tab` llega al botón "CEO — abrir centro de mando" y `Enter` o `Espacio` lo activan.

## 6. Transición de cámara, paso a paso

Tiempos medidos en el prototipo (clic a HUD visible: **810 ms**; HUD completamente ensamblado a ~1,8 s).

| t (ms) | Paso | Escena 3D (punto de integración a verificar) |
|---|---|---|
| 0 | Clic o Enter en el CEO. Se marca el fondo como inerte. Se guarda el elemento que dispara (para devolver el foco). | Pausar hover y clics de la escena (ver 6.1). |
| 0–800 | **Dolly out**: la cámara se aleja del CEO y lo deja encuadrado en la ventana despejada. Prototipo (escritorio): `translate(-6%,-17.5%) scale(.68)` con `cubic-bezier(.2,.75,.2,1)`; en móvil, `scale(.72) translateY(-3%)`. | Animar la posición/zoom de la cámara hacia atrás mediante `cameraHub`, con la misma curva, hasta un encuadre que ponga al CEO en el centro de la ventana. |
| 800 | Se muestra el HUD (`data-state="opening"`), se anuncia la apertura y el foco va a la pestaña activa. | Se puede bajar la tasa de render del canvas (ver 6.1). |
| 800–1400 | Los paneles entran con escalonado de 80 ms (opacidad, 14 px de desplazamiento, escala .97) y las líneas del marco y las reglas se dibujan (`stroke-dashoffset`). | |
| ~1800 | Estado `open`. Se retiran las animaciones. | |
| Cierre (Esc/botón) | Los paneles salen en orden inverso (280 ms + escalonado de 40 ms), se oculta el HUD (~470 ms), **se retira lo inerte y el foco vuelve al CEO**, y en ese momento la cámara regresa (800 ms). | Restaurar la cámara con `cameraHub`, reanudar el render completo y los eventos de la escena. |

**Movimiento reducido** (`prefers-reduced-motion: reduce`, o el interruptor del prototipo): sin dolly, sin dibujo de líneas, sin pulsos; el HUD aparece con un fundido de 120 ms. Medido: HUD visible 82 ms tras el clic. La cámara se mantiene en su sitio (en 3D es lo más seguro) y la ventana despejada enseña al CEO sin acercarlo.

### 6.1 Coordinación con la escena 3D (puntos de integración a verificar)

Nada de esto existe en este checkout; hay que confirmarlo en `web/src/office3d/systems/interactionSystem.ts` y alrededores antes de implementar.

1. **Cámara (`cameraHub`).** Confirmar si ofrece una API para animar posición, zoom y objetivo, y si devuelve una promesa o evento de fin. Si no, el HUD usa un temporizador de 800 ms como el prototipo. Definir el encuadre final del dolly para que el CEO quede visible detrás del HUD, y evitar que la cámara quede fuera de los límites de la escena.
2. **Clic sobre personajes existente.** Reutilizar el manejador actual: el clic en el CEO abre el HUD en lugar de abrir la ficha en el panel derecho. Confirmar cómo hoy se distingue el CEO y cómo se obtiene el agente seleccionado.
3. **Hub de accesibilidad (`a11yHub`).** Confirmar qué expone (anuncios, lista de personajes enfocables) para que el CEO sea alcanzable con teclado y para no duplicar anuncios entre `a11yHub` y la región `aria-live` del HUD. Probablemente deban compartir un único punto de anuncio.
4. **Pausa/limitación del bucle `requestAnimationFrame`.** Con el HUD abierto, la escena queda como fondo. Proponer: bajar a ~30 fps o pausar los efectos secundarios (partículas, animaciones idle), con reanudación al cerrar. Verificar si ya hay un mecanismo de pausa (por ejemplo al ocultar la pestaña).
5. **Bloqueo de hover y clics.** Mientras el HUD está abierto, el canvas no debe recibir `pointermove`/`click`. El HUD cubre toda la pantalla (`position: fixed; inset: 0`) y recibe los eventos, pero conviene también desactivar el *raycasting* para ahorrar CPU y evitar tooltips fantasma. Verificar cómo se registran esos manejadores (¿en el canvas o en `window`?).
6. **Fondo transparente sobre el canvas.** El HUD es un hermano posterior al contenedor del canvas, sin fondo propio salvo el velo radial; los paneles grandes están al 78 % y las tarjetas con texto al 95 %. Verificar que el canvas no esté dentro de un contenedor con `isolation`/`overflow` que lo recorte, y que el contenedor del canvas admita ser inerte (`inert`) sin afectar al render. Con paneles tan translúcidos, el desenfoque de fondo (3 px) y el costo de componer sobre un canvas WebGL deben medirse en equipos modestos.
7. **Foco al abrir y cerrar.** El elemento que devuelve el foco es el control del CEO (botón real o proxy accesible). Si hoy el CEO solo existe dentro del canvas, hace falta un control HTML oculto o visible que lo represente (el prototipo usa un `<button>` superpuesto).

## 7. Accesibilidad

**Diálogo.** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apunta al título (`h2`). Mientras está abierto, la escena y su control quedan `inert`, y un listener de `Tab` atrapa el foco dentro del HUD. El foco inicial va a la pestaña del módulo activo.

**Lector de pantalla.**
- Región `aria-live="polite"` dentro del diálogo para: apertura ("Centro de mando abierto. Módulo 1 de 5…"), cambio de módulo, resolución de aprobación ("Aprobada: … Quedan 3 aprobaciones pendientes"), intento de aprobar sin la nota obligatoria, lanzamiento de tareas de la agenda y envío de solicitudes. Una segunda región fuera del diálogo anuncia el cierre.
- Pestañas con nombre accesible por contenido ("05 Ejecuciones 4 pendientes"; el contador visible es decorativo y el texto equivalente va sin coma ni separadores).
- Estados: icono (oculto a lectores) más texto siempre.
- Gauges: el SVG es `aria-hidden`; la información está en texto real ("5 de 19 tareas completadas").
- Los controles repetidos llevan `aria-label` con contexto que **comienza con el texto visible** (por ejemplo, "Aprobar Emitir factura de Nubia Ltda.").
- Errores de campo (nota obligatoria, área sin elegir): el mensaje se asocia con `aria-describedby` y se anuncia **una sola vez** por la región `aria-live`; no usan `role="alert"` para no duplicar el anuncio.

**Teclado.** Todo se opera sin mouse (sección 5). Foco visible en todos los controles; los botones recortados usan anillo interior porque `clip-path` cortaría el exterior. Objetivos táctiles de 40–44 px (móvil 44 px).

**Movimiento reducido.** Ver sección 6. Se aplica con `prefers-reduced-motion` y con un interruptor en el prototipo (clase `rm` en `<html>`).

**Contraste.** Los paneles grandes están al 78 % de opacidad y las tarjetas al 95 %. Se calculó el contraste con los colores efectivos de cada elemento, componiendo todos los fondos translúcidos del HUD sobre **blanco puro y sobre negro puro** (peor caso de lo que haya detrás; el velo oscuro del HUD no se cuenta, así que el cálculo es conservador). El texto que va directo sobre un panel grande (subtítulos, rótulos, gauges, riel) es el caso más exigente:

| Elemento | Contraste | Elemento | Contraste |
|---|---|---|---|
| Título del HUD | 8,46 | Botón primario / peligro | 11,94 / 10,06 |
| Subtítulo del módulo (sobre panel) | 5,28 | Chip activo / inactivo | 11,94 / 14,48 |
| Rótulo de grupo (mono 12 px, sobre panel) | 5,85 | Badges advertencia / ok / peligro | 11,73 / 7,78 / 5,79 |
| Texto principal / atenuado en tarjeta | 13,81 / 8,62 | Indicador Simulación | 6,33 |
| Etiqueta de gauge / subtexto (sobre panel) | 8,46 / 5,28 | Contador de la pestaña 5 | 11,25 |
| Pestaña inactiva / activa | 5,28 / 9,27 | Número del hexágono activo | 10,68 |
| Etiqueta visible de la barra de solicitud | 5,85 | Texto de los campos | 17,23 |
| **Placeholder** (barra de solicitud y notas) | 10,75 | **Borde de la barra de solicitud** (campo vs. entorno) | 5,23 |
| Historial: nota/error | 5,28 | **Borde del campo de nota** | 8,54 |

El mínimo es 5,23:1 (requisito: 4,5:1 para texto; 3:1 para el borde de los campos y otros componentes). Al pasar los paneles de 93 % a 78 % el mínimo bajó de 8,88 a 5,23, y se compensó con el borde `--line` de los campos y con `opacity:1` en el placeholder (antes 4,09:1 y 2,65:1).

**Colores forzados** (`forced-colors: active`): se elimina el recorte y los pseudo-elementos de borde, y los paneles, tarjetas y botones pasan a `Canvas` con borde `CanvasText`. La pestaña activa y el chip activo usan `Highlight`/`HighlightText`; los gauges usan `Highlight` y `GrayText`. Se comprobó con emulación en Chromium: todo el texto es legible y el estado activo se distingue por relleno, no solo por color. No se pudo probar en Windows con un tema de alto contraste real.

**Verificación automática.** axe-core sobre el HUD abierto en los cinco módulos y en la ficha de agente: **0 violaciones** (reglas wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa y best-practice). Quedan "incompletos" que axe no puede decidir (color-contrast por fondos translúcidos, cubierto con el cálculo de arriba; `label-content-name-mismatch` en los botones +/− del árbol, cuyo texto visible es un símbolo).

## 8. Costo en bundle

Datos de partida: el chunk diferido de la oficina 3D mide **172 409 B de 194 560 B** (margen de **22 151 B**, unos 21,6 KiB). Meter el HUD dentro de ese chunk lo dejaría sin holgura.

**Propuesta.** El HUD va en **su propio chunk diferido** (`import()` dinámico), con React y su CSS, **sin librerías nuevas**: gauges y sparklines son SVG a mano; las animaciones, CSS puro. Se precarga en el primer clic sobre el CEO (o con `requestIdleCallback` tras la carga de la oficina para que el dolly no espere la red; **a decidir**, ver preguntas abiertas). React ya está en el bundle principal, así que no se cuenta de nuevo.

**Presupuesto explícito (propuesto):**

| Concepto | Presupuesto |
|---|---|
| Chunk del HUD (JS + CSS, minificado) | ≤ 48 KiB (49 152 B) sin comprimir y ≤ 16 KiB gzip |
| Cambio en el chunk 3D | +0 B (solo el punto de enganche del clic y la API de cámara, ≤ 1 KiB, a verificar) |
| Librerías nuevas | 0 |

**Medición real del prototipo** (revisión 2, script propio, `gzip -9`; es una **estimación**: el prototipo es vanilla JS no minificado, no React, y trae datos y escena de ejemplo que en producción no existen o llegan por la API):

| Parte | Bytes | gzip -9 |
|---|---|---|
| CSS del prototipo | 19 372 | 5 457 |
| CSS sin comentarios ni espacios (aprox. minificado) | 18 412 | 5 023 |
| JS del prototipo | 50 441 | 15 979 |
| — de ello: datos de ejemplo (agentes, 19 procesos, 27 recurrentes, tareas, ejecuciones, agenda) | 15 943 | 5 086 |
| — de ello: dibujo de la escena falsa | 3 058 | 1 337 |
| HTML completo | 74 069 | 22 606 |

Lectura: quitando datos y escena, la lógica y las plantillas rondan 31,4 KB de JS (~9,6 KB gzip) más ~18,4 KB de CSS (~5,0 KB gzip). Minificado y escrito en TSX se estima un chunk de **38–46 KB y 12–15 KB gzip**, dentro del presupuesto pero con poco margen: la integración del modelo de procesos hizo crecer el prototipo (JS de 34,6 a 50,4 KB). Si no cabe, el plan es separar en un segundo chunk los formularios de agente y de acción, que ya existen en el bundle principal si se reutilizan (`TeamPanel`, `ActionsPanel`; hay que confirmar dónde viven hoy). El presupuesto debería vigilarse en CI con un límite de tamaño por chunk.

## 9. Riesgos y preguntas abiertas

**Riesgos**

1. **`clip-path` recorta sombras, `outline` y tooltips** que salgan del borde. Mitigación: anillos de foco interiores, padding suficiente y tooltips fuera de los elementos recortados.
2. **`backdrop-filter` y rendimiento** en equipos modestos con un canvas WebGL debajo. Mitigación: el desenfoque es de solo 3 px y decorativo, y se puede desactivar con una clase; el contraste del texto no depende de él (se mide sin desenfoque).
3. **Foco atrapado y lectores de pantalla.** El comportamiento de `aria-modal` varía entre lectores; por eso se usa también `inert` en el fondo. Hay que probar con NVDA, JAWS y VoiceOver (no se pudo en este entorno).
4. **Dolly sobre el 3D real.** El prototipo lo simula con `scale`; la cámara real puede chocar con límites de escena o tardar más.
5. **Pérdida de contexto visual.** El HUD cubre casi toda la pantalla; el usuario ya no "ve" a los agentes trabajar mientras aprueba. Mitigación ya aplicada en el prototipo: una ventana despejada con el CEO encuadrado y paneles grandes al 78 %, de modo que la oficina se ve detrás. Falta validarlo con el 3D real; se podría añadir un modo compacto.
6. **Escala de datos.** 19 procesos, 27 recurrentes y 8 áreas caben; con 30 áreas o cientos de tareas hacen falta paginación o virtualización. Con el HUD en un panel de ~460 px de alto a 1440×900, los módulos largos se leen con scroll interno.
7. **Móvil:** la barra superior ocupa mucho alto en 390 px; revisar en dispositivo real.

**Preguntas abiertas**

1. ~~¿Modelo de datos de los módulos 01 y 03?~~ **Resuelta**: ya existe en el SPEC del modelo de procesos (sección 4.1 de este documento). Queda pendiente confirmar que la implementación respete esos contratos (`Process`, `RecurringTask`, `AgendaResponse`, `Area`, `ApprovalPolicy`).
2. ~~¿Quién marca una tarea del día como hecha?~~ **Resuelta**: nadie la marca; el estado se calcula (`AgendaStatus`, SPEC §5.4). Las R-DIR las ejecuta el CEO agente; el humano solo lanza las manuales ("Lanzar ahora") o las omite (`/skip`).
3. ¿El clic en otros personajes (no CEO) debe abrir el HUD en su ficha de área, o mantener la ficha actual?
4. ¿Se permite borrar al CEO o a un agente con aprobaciones pendientes? (El prototipo solo muestra el estado deshabilitado.)
4b. ¿Se debe ordenar la bandeja de aprobaciones por urgencia (decisión de diseño de este prototipo; el SPEC no define el orden)?
4c. ¿Hay un endpoint, o un filtro de `GET /api/tasks`, para las ejecuciones del día? Hoy el historial y el gauge "Ejecuciones de hoy" se derivarían de `TaskTree.actionRuns`.
5. ¿La precarga del chunk va en el primer clic (más simple, posible espera) o en reposo (mejor sensación, consume red)?
6. ¿El límite de 194 560 B del chunk 3D se mide en bytes sin comprimir o gzip? Hay que confirmarlo para fijar el presupuesto del HUD en la misma unidad.
7. ¿Se mantiene un panel lateral mínimo cuando el HUD está cerrado (por ejemplo, solo la barra de solicitud)?
8. ¿Hace falta tema claro o modo de alto contraste propio, más allá de `forced-colors`?

## 10. Plan de implementación propuesto (no implementado)

| # | Tarea | Resultado | Depende de |
|---|---|---|---|
| H-02 | Reconocimiento del código 3D: `cameraHub`, `a11yHub`, clic sobre personajes, bucle de render, contenedor del canvas | Informe con las APIs reales, y respuesta a la sección 6.1 | |
| H-03 | Tokens y estilos base del HUD (CSS, `clip-path`, estados, `forced-colors`, movimiento reducido) | Archivo CSS dentro del presupuesto | |
| H-04 | Esqueleto del HUD en React: diálogo, trampa de foco, `inert`, riel/tablist, región `aria-live`, barra superior y gauges con datos reales | Chunk diferido cargado desde el clic en el CEO | H-02, H-03 |
| H-05 | Transición: dolly con `cameraHub`, ensamblado y cierre, pausa del render y bloqueo del hover/clic de la escena | Secuencia de la sección 6 sobre la oficina real | H-02, H-04 |
| H-06 | Módulo 05 Ejecuciones y aprobaciones (migra `ApprovalsPanel`, y suma la nota obligatoria, el origen de la aprobación y la urgencia) y módulo 04 Tareas de los agentes (migra `ActivityPanel`) | Paridad funcional con las pestañas actuales, más el historial derivado del día | H-04 |
| H-07 | Módulo 02 Áreas con ficha, y migración de `TeamPanel`, `ActionsPanel` y `AgentDetail` (CRUD completo; líder y apoyo; selector de `areaId`; lista de deshabilitados o sin área) | Paridad funcional del CRUD de agentes y acciones | H-04 |
| H-08 | Barra de solicitud al CEO fija dentro del HUD (migra `RequestBar`) | Solicitud desde cualquier módulo | H-04 |
| H-09 | Módulos 01 y 03: construir las vistas sobre `GET /api/processes`, `/api/recurring-tasks` y `/api/agenda` (SPEC del modelo de procesos), incluida la nota obligatoria en 05 | Módulos nuevos con datos reales | H-04, implementación del modelo de procesos |
| H-10 | Retiro del panel derecho de pestañas y limpieza del código antiguo | App sin duplicidad | H-06, H-07, H-08 |
| H-11 | Verificación: pruebas de teclado y axe en CI, presupuesto de tamaño por chunk, pruebas con lectores de pantalla y en dispositivo móvil real | Lista de verificación cumplida | H-05 a H-10 |

## Apéndice: cómo se verificó el prototipo

Con Playwright (Chromium) sobre el HTML abierto desde archivo, tras la revisión 2:

- **Consola:** cero mensajes de error o advertencia en escritorio, móvil (390 y 320 px) y movimiento reducido.
- **Teclado completo:** `Tab` hasta el CEO, `Enter` (HUD visible en 810 ms), foco inicial en la pestaña 01, flechas, `Home`, `End`, atajos `1`–`5` (con roving tabindex 0 solo en la pestaña activa), área de Marketing con sus 2 agentes, ficha de Eco (clave `comunicaciones`), lista "sin área" con Pliego, "Nuevo agente" sin área (error y foco en el selector) y con área (se crea la ficha), agenda (Relanzar) y aprobaciones.
- **Aprobaciones:** la urgente (untrusted_input) se aprueba con nota y los gauges pasan de 11|4|8|26 % a 10|3|8|32 %; aprobar la factura de U-02 sin nota no la resuelve (3 pendientes se mantienen, error visible, foco en la nota, un solo anuncio y sin `role="alert"`); aprobar el recordatorio de U-03 sin nota sí funciona.
- **Atajos con foco fuera del riel/módulo:** `2` escrito en la barra de solicitud queda como texto y `3` con el foco en "Cerrar" no cambia de módulo.
- **Esc con borrador:** con una nota escrita, `Esc` cierra, devuelve el foco al CEO, avisa "Se conservaron tus borradores" y al reabrir la nota sigue ahí.
- **Trampa de foco:** 40 pulsaciones de `Tab` sin salir del HUD, y `Shift+Tab` dentro. El cierre con el botón también devuelve el foco al CEO.
- **Movimiento reducido** (`reducedMotion: 'reduce'`): HUD visible en 82 ms, sin clase `dolly`, transición de la escena en 0 s, animaciones de paneles, líneas y pulsos en `none`, fundido de 0,12 s.
- **390 y 320 px:** sin desbordamiento horizontal en la oficina ni en los cinco módulos (incluida la ficha de agente); la barra de demo queda oculta con el HUD abierto.
- **axe-core:** 0 violaciones en los cinco módulos y en la ficha de agente.
- **Contraste:** cálculo del peor caso (sección 7), con el placeholder y los bordes de los campos incluidos.
- **Encuadre del CEO:** a 1440×900 queda dentro de la ventana despejada.

Los scripts de verificación no se versionan (viven fuera del repositorio).

No verificado: lectores de pantalla reales, Windows con alto contraste real, rendimiento en equipos modestos, integración con el 3D real.
