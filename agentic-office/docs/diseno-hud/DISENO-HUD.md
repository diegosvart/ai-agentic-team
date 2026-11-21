# H-01 · Propuesta de diseño del HUD del CEO

Estado: propuesta de diseño, revisión 4. No se modificó el código de la app. Prototipo: [`prototipo-hud.html`](./prototipo-hud.html) (un solo archivo, sin dependencias; ábrelo directo en el navegador). Todos los datos son ficticios (empresa "Aster Consultores", consultora B2B de unas 30 personas) y siguen el seed `servicios-b2b` (SPEC §8) y PROCESOS.md en la **revisión 3 del modelo de procesos**: 9 agentes (CEO y 8 más, con `comunicaciones` como apoyo de Marketing), 8 áreas, 19 procesos `P-XXX-NN`, 27 recurrentes `R-XXX-NN`, políticas U-01 a U-05, `untrustedInput` ampliado (D-M17), recurrentes sin delegación (D-M19: R-DIR-04a/b/c y R-DIR-05), pedidos internos `[ESCALAR]`/`[TRASPASO área]` en la tabla `internal_requests`, de entrega única (D-M20), jornada `workHours` 09:00–18:00 y R-DIR-08 / P-DIR-03 al **4.º día hábil**.

## 1. Objetivo y alcance

**Objetivo.** Reemplazar el panel derecho de pestañas (Actividad, Aprobaciones, Equipo, Acciones) y la ficha del agente por un centro de mando tipo HUD de ciencia ficción que aparece sobre la oficina 3D cuando haces clic en el CEO: la cámara se aleja y el HUD se ensambla encima, con fondo traslúcido que deja ver la oficina.

**Dentro del alcance.** Sistema visual, anatomía, cinco módulos, mapeo de funciones actuales, navegación y atajos, secuencia de transición, accesibilidad, presupuesto de bundle, riesgos y plan de implementación.

**Fuera del alcance.** Implementación en React, cambios en el servidor o en `shared`, y cualquier cambio en el código 3D (que no está en este checkout). Todo lo que toque el código 3D se marca como **punto de integración a verificar**.

**Capturas** (2x, PNG de 256 colores: 121, 198, 168 y 70 KB, unos 557 KB en total; los colores de los agentes se conservan):

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
| `--solid` | `#061834` | Fondo sólido (relleno de hexágonos, tooltips) |
| `--panel` | `rgba(5,20,46,.50)` | **Marco** de los paneles grandes (riel, resumen, módulo, barra de solicitud, barra superior): 50 % de opacidad, para que se vea la oficina detrás. Nunca lleva texto directo. |
| `--plate` | `rgba(5,20,46,.92)` | **Placa** de texto: todo texto suelto sobre un marco (títulos y subtítulos del módulo, rótulos, pestañas del riel, gauges, el campo de solicitud, la barra superior) va sobre una placa casi opaca. |
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

Un solo easing, `cubic-bezier(.2,.75,.2,1)`. Dolly de 800 ms, paneles de 600 ms con escalonado de 80 ms, líneas dibujadas en 900 ms (`pathLength="1"`, `stroke-dasharray:1` y `stroke-dashoffset` de 1 a 0; en una corrida de 40 muestras, 12 quedaron a medio dibujar, y con movimiento reducido no hay animación), cierre de 280 ms más escalonado. Los pulsos (anillo del CEO, punto de "Simulación") son lo único cíclico, y se apagan con movimiento reducido.

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

- Rejilla de escritorio: columnas `108px | 1fr | 292px` y filas `auto | 31vh (mín. 150 px) | 1fr | auto`. La fila 2 es la **ventana despejada**: sin panel, con cuatro esquinas y un rótulo arriba a la izquierda (que no tapa al personaje). Es el mecanismo principal para ver la oficina, y el dolly **calcula** su encuadre con la geometría real de esa ventana en cada ancho (sección 6). A 1440×900 la ventana mide 964×279 px y el CEO queda en (628, 243). Los marcos de los paneles están al 50 %, pero casi no dejan ver la oficina: el texto va sobre placas por legibilidad y la medición real está en la sección 7. Escalonado de entrada: topbar (0), riel (1), módulo (2), resumen (3), barra de solicitud (4).
- **Móvil (≤860 px)**: una columna con scroll vertical. Barra superior pegajosa arriba; una **franja de ventana de 15vh** con el CEO encuadrado; los 4 gauges en **una sola fila** (2 columnas en ≤360 px); módulo; barra de solicitud; y el riel como barra inferior pegajosa. Como las dos barras pegajosas tapan parte del contenido, el contenedor con scroll usa `scroll-padding-top/bottom` medidos con el alto real de las barras (sección 7). Se oculta la sparkline y la fecha.
- **Gauges.** Cada uno es un anillo SVG decorativo (`aria-hidden`) más un número visible y dos textos reales: etiqueta ("Tareas activas") y equivalente textual ("13 de 22 tareas"). Definiciones: activas = tareas en cola, planificando, en curso o esperando aprobación; pendientes = ejecuciones en `pending_approval`; ejecuciones de hoy = todas las `ActionRun` del día; % completado = tareas `completed` / total.

### 3.1 Módulos

| # | Módulo | Contenido | Interacción |
|---|---|---|---|
| 01 | Procesos y tareas | Chips por área (filtro, `aria-pressed`) y las 19 tarjetas de proceso (`Process`): código `P-XXX-NN`, tipo (estratégico, operativo, soporte), dueño, disparador y sus recurrentes (`RecurringTask`: código `R-XXX-NN`, automática o manual, frecuencia `daily`/`weekly`/`monthly` con su hora y la marca **"sin delegación"** en R-DIR-04a/b/c y R-DIR-05, D-M19). Los procesos que se activan por evento muestran "Sin tareas recurrentes". Botones de configuración: "Nuevo proceso", "Nueva tarea recurrente" y, por tarjeta, "Editar" y "Borrar". | Filtrar por área. Los botones de configuración son maquetas (sección 4.2). |
| 02 | Áreas de la compañía | Rejilla de 8 áreas: líder, estado, tareas activas y sparkline (ilustrativa). **Área**: misión y lista de **todos** sus agentes (líder y apoyo; Marketing muestra a Lumen y a Eco), cada uno con "Abrir ficha", "Editar" y "Borrar"; "Habilitar/Deshabilitar área" (un área deshabilitada saca a sus agentes del equipo que ve el CEO y sus recurrentes de la agenda, SPEC §4; el prototipo oculta sus filas de la agenda), "Editar área", "Borrar área" y "Nuevo agente en esta área". **Ficha del agente**: clave del agente (p. ej. `ventas`), área, rol, estado, modelo, acciones con su CRUD (efecto, aprobación 🔒 y política) y actividad reciente. "Nuevo agente" abre un formulario con un **selector de área** (`areaId`); sin área muestra el error y no crea el agente. En la cabecera, "Nueva área". Al final, la lista **Agentes deshabilitados o sin área**. | "Abrir área", "Abrir ficha" y "Volver" (el foco vuelve al control de origen); habilitar o deshabilitar al agente. |
| 03 | Tareas del día del CEO | Agenda simulada del martes 24 nov 2026, 13:10, con **lo que ve y decide el Dueño** (PROCESOS §6.1). **Rutina de hoy**: las 8 R-DIR (01, 02, 04a, 03a, 04b, 03b, 04c, 05) con estado `AgendaStatus`: R-DIR-01 `waiting_approval` (una hija espera aprobación), R-DIR-02 y R-DIR-04a `done`, R-DIR-03a `running`, las demás `scheduled`; las R-DIR-04a/b/c y R-DIR-05 llevan "sin delegación". El botón de cada fila depende del estado: **"Ver resultado"** solo en `done` (R-DIR-02 y R-DIR-04a, con lo que ya existía a su hora: la lista de las 09:00 no cita la factura de las 11:05, y la bandeja de las 10:00 solo cita las dos ejecuciones creadas antes), **"Ver error"** en `failed` (R-CLI-01) y **"Ver plan y subtareas"** en las raíces abiertas (R-DIR-01 y R-DIR-03a). **Pedidos internos entregados hoy** (D-M20): tres líneas `[ESCALAR]`/`[TRASPASO comercial]` con su agente de origen, marcadas "Entregado a R-DIR-02" (la primera recurrente del CEO con `recent_results` los consume a las 09:00 y no vuelven a llegar). **Manuales, fallidas y relanzadas de hoy**: R-MKT-02 (manual, `due`) y R-CLI-01 (`failed`). **Atrasadas** (días anteriores): R-DIR-05 del lunes 23 (`missed`) y R-PER-02 del viernes 20 (manual, `due`). Barra de avance y fila "Aprobar ejecuciones pendientes: N". | "Lanzar ahora" y "Omitir" (por lanzar y perdidas), "Relanzar" (fallidas) y el botón de detalle según el estado. Una atrasada lanzada pasa a "relanzadas" y sale de Atrasadas. "Ir a aprobaciones" salta al módulo 05. |
| 04 | Tareas de los agentes | Árbol solicitud → subtareas, con agente, estado (icono + texto) y ejecuciones asociadas. Leyenda de estados. | Expandir/contraer con botones `aria-expanded`. |
| 05 | Ejecuciones y aprobaciones | Bandeja de **5 pendientes**, con las urgentes primero (`urgent`, `businessHoursWaiting` sobre la jornada 09:00–18:00): acción, parámetros, **por qué pide aprobación** (`approvalSource`: acción 🔒, política `policyId` o entrada no confiable) y nota opcional u obligatoria (`requireNote`). Casos del prototipo: `enviar_recordatorio_cobro` de $3.200.000 **urgente** por `untrusted_input` (nació de la R-DIR-01 del lunes 23 a las 11:00 y lleva 11,2 h hábiles esperando: 7 h del lunes hasta las 18:00 y 4,2 h del martes desde las 09:00); `agendar_reunion_comercial` por acción 🔒 (3,5 h); `gestionar_acceso` por acción 🔒 (2,3 h); `emitir_factura` por $18.400.000 CLP con U-02 y nota obligatoria (2,1 h); `enviar_recordatorio_cobro` por $24.500.000 con U-03 sin nota obligatoria (1,5 h; nace de una solicitud del Dueño, que es de origen confiable). Historial del día con nota y error. Sección **Políticas de aprobación (U-01 a U-05)** con "Nueva política", "Editar" y "Borrar". | Resolver en memoria: actualiza contadores, gauges, árbol y estado del agente, y mueve el foco a la siguiente tarjeta. Aprobar sin nota cuando es obligatoria muestra el error, mantiene la tarjeta y enfoca la nota. |

### 3.2 Barra superior

Empresa y título, fecha (simulada en el prototipo), **estado de conexión**, **modo** y "Cerrar". Las etiquetas son las que hoy muestra `App.tsx` del MVP: **tres** estados de conexión, "Conectando…", "En vivo" y "Reconectando…" (`CONNECTION_LABEL`, líneas 14–18), y dos modos, "Claude en vivo" y "Simulación", este último con el título de modelos "Opus: … · Sonnet: …" (líneas 71–73). En el HUD llevan tonos y texto, nunca solo color: conectando en azul, en vivo en verde y reconectando en ámbar. El origen exacto del estado de conexión se debe verificar. El prototipo muestra fijos "En vivo" y "Simulación"; el texto de los modelos va también como texto oculto, porque un `title` no se lee con teclado. En la implementación, los cambios de conexión se anunciarían por la región `aria-live`.

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
| Selección de agente en la oficina (hover/tooltip/clic sobre personajes) | Abre la ficha | Se conserva el hover/tooltip. El clic en el CEO abre el HUD en el módulo 01. **Confirmado por el usuario:** un clic en un agente que no es el CEO abre el HUD en la ficha de ese agente (módulo 02), con la misma transición. El prototipo lo implementa con un botón por personaje ("Brisa — abrir ficha del agente"): anuncia "abierto en la ficha de Brisa" y, al cerrar, el foco vuelve a ese personaje. Falta verificar con el 3D real cómo `cameraHub` encuadra al agente clicado (**punto de integración a verificar**). |
| Tiempo real (SSE `/api/events`) | Actualiza actividad y aprobaciones | Los mismos datos alimentan 04, 05 y los gauges. El prototipo usa estado en memoria. |
| Estado de conexión y modo (`App.tsx`: "En vivo" / "Reconectando…" y "Claude en vivo" / "Simulación" con el título de modelos) | Indicadores del encabezado | **Barra superior** del HUD (sección 3.2). No se pierde ninguno. |
| CRUD de áreas, procesos, recurrentes y políticas | No existe hoy (es del modelo de procesos) | **Configuración**, dentro de los módulos 01, 02 y 05 (sección 4.2). |

Funciones nuevas (no existen hoy en el MVP): módulo 01 Procesos y tareas recurrentes, y módulo 03 Tareas del día del CEO. Ya tienen modelo y API en el SPEC del modelo de procesos ([`../modelo-procesos/SPEC.md`](../modelo-procesos/SPEC.md); procesos en [`PROCESOS.md`](../modelo-procesos/PROCESOS.md)):

### 4.1 Fuentes de datos por módulo

| Módulo | Datos | Tipos (SPEC §3) | Endpoints (SPEC §6) |
|---|---|---|---|
| 01 Procesos y tareas | Procesos por área y sus tareas recurrentes (código, modo manual/automático, hora, frecuencia) | `Process`, `RecurringTask` | `GET /api/processes` (filtro `?areaId=`), `GET /api/recurring-tasks` (filtros `?agentId=`, `?processId=`). Acciones "Lanzar ahora" y "Omitir": `POST /api/recurring-tasks/:id/run` y `/skip`. |
| 02 Áreas | Área, agentes (líder y apoyo) y su estado; fichas de agente y sus acciones | `Area` (`StateResponse.areas`), `Agent` (con `areaId` y `reportsToAgentId`), `ActionDef` (con `sideEffect`) | `GET /api/state`, `GET/POST /api/areas`, `PATCH/DELETE /api/areas/:id`, `POST/PATCH /api/agents`, `DELETE /api/agents/:id`, `POST/PATCH/DELETE /api/actions` (`/actions/:id` en PATCH y DELETE) |
| 03 Tareas del día del CEO | Vista calculada de la agenda: las ocho rutinas R-DIR del día (R-DIR-01, 02, 03a, 03b, 04a, 04b, 04c y 05, PROCESOS §6.1), más las manuales y fallidas de las áreas y las atrasadas. El resultado de cada fila (`Ver resultado`) y los pedidos internos (D-M20) | `AgendaResponse`, `AgendaItem` (con `taskId`), `AgendaStatus` (`scheduled`, `due`, `running`, `waiting_approval`, `done`, `failed`, `skipped`, `missed`), `RecurringTask.allowDelegation`, `Task.result` | `GET /api/agenda?date=AAAA-MM-DD` (§5.4); `GET /api/tasks/:id` (`TaskTree`, para el resultado de `taskId`); `POST /api/recurring-tasks/:id/run` y `/skip`. Los pedidos internos se guardan en `internal_requests` (SPEC §4, entrega única a la primera recurrente del CEO con `recent_results`); el SPEC no define cómo listarlos (pregunta abierta 10). |
| 04 Tareas de los agentes | Árbol solicitud → subtareas | `Task` (con `?origin=recurring` y `?processId=`), `ActionRun` | `GET /api/tasks`, SSE `/api/events` |
| 05 Ejecuciones y aprobaciones | Bandeja e historial; política que aplicó, origen de la aprobación, urgencia y si exige nota | `ActionRun` (`approvalSource`, `policyId`, `requireNote`, `resolvedBy`), `ApprovalPolicy` (U-01 a U-05, con `conditions` AND), `AgendaResponse.pendingApprovals` (`urgent`, `businessHoursWaiting`) | `GET /api/approvals`, `POST /api/action-runs/:id/approve` (400 si `requireNote` y la nota viene vacía o con solo espacios) y `POST /api/action-runs/:id/reject` (no exige nota, SPEC §5.3); `GET/POST /api/approval-policies` |

Consecuencias de diseño:

- El módulo 03 **no** es una checklist que el humano marca: es la agenda calculada, con estados de `AgendaStatus` (§5.4). Las R-DIR son **automáticas**: el programador las lanza a su hora y, hasta 2 horas después de vencida, siguen `scheduled`. Por eso `due` solo aparece con una recurrente **manual** (R-MKT-02, R-FIN-04, R-PER-02) o con una automática que el programador ya no tomará. Una automática de un día anterior sin ocurrencia es `missed` y **solo** se muestra en "Atrasadas".
- **Estados coherentes con D-M19 y §5.4.** R-DIR-04a/b/c y R-DIR-05 corren **sin delegación**: el CEO planifica con un equipo vacío, así que nunca crean una hija ni un `ActionRun`, y por eso nunca pasan a `waiting_approval` (R-DIR-04a está `done`). R-DIR-01 sí delega: como una de sus hijas espera aprobación, la raíz está `waiting_approval`. Los dos casos se ven en el módulo 01 y en el 03 ("sin delegación").
- **"Lanzar ahora"** sobre una `missed` o `due` de un día anterior llama a `POST /api/recurring-tasks/:id/run` con `{ date }` igual a la fecha de **esa** ocurrencia (por ejemplo `2026-11-23`), no a la de hoy. **"Relanzar"** una `failed` también es posible: el mismo endpoint crea una raíz nueva y la ocurrencia pasa a apuntarla (SPEC §5.2; en los demás casos responde 409). **"Omitir"** llama a `POST /api/recurring-tasks/:id/skip` con `{ date }`. Tras lanzar una atrasada, la fila sale de "Atrasadas".
- El módulo 05 exige nota para **aprobar** cuando `requireNote` es verdadero y no para rechazar. `requireNote` es el OR de las políticas que aplicaron: U-02 la exige y U-03 no.
- La bandeja muestra el motivo (`approvalSource`, en el orden acción, política, entrada no confiable) y ordena primero las urgentes. `urgent = businessHoursWaiting >` la duración de la jornada de `workHours` (9 h). Ordenar por urgencia es una decisión de diseño: el SPEC no define el orden de la bandeja. Una ejecución pendiente desde el lunes a las 11:00 llega a 11,2 h hábiles a las 13:10 del martes; ninguna de las de hoy supera las 3,5 h.
- **Entrada no confiable (D-M17).** Toda raíz recurrente con contexto o prefetch es `untrustedInput`, igual que las de origen `inbound`: sus acciones externas piden aprobación aunque la acción no la pida. Eso cubre R-DIR-01 a R-DIR-06. La excepción U-03 (`enviar_recordatorio_cobro` va sin aprobación hasta 20 MM CLP) vive solo en trabajo de origen confiable: las solicitudes del Dueño, las recurrentes de área sin contexto (como R-FIN-01) **y las recurrentes del CEO que no reciben información, R-DIR-07 y R-DIR-08**.
- **Historial y gauge "Ejecuciones de hoy".** No existe un endpoint por día: se derivan de `GET /api/tasks`, donde cada `TaskTree` trae `actionRuns` (SPEC §3; las del día se filtran por `createdAt`/`resolvedAt`, a verificar). El historial del día es una vista nueva, porque `ApprovalsPanel` no lo tiene. El gauge cuenta solo las ejecuciones **de hoy** (8 en el prototipo): la pendiente desde el lunes (la urgente) cuenta en "Aprobaciones pendientes" pero no en "Ejecuciones de hoy".
- **Sparklines.** Son **ilustrativas** (datos de ejemplo): ninguna métrica del SPEC o del MVP las alimenta hoy. La del resumen (actividad por hora) y las de las tarjetas de área se definirían en la implementación; una opción es contar `ActionRun` por hora desde `TaskTree.actionRuns` (**a decidir**). Son `aria-hidden` y el resumen en texto lo aclara.

### 4.2 Configuración (CRUD de áreas, procesos, recurrentes y políticas)

El modelo de procesos trae un CRUD que el MVP no tiene. Para no crear un sexto módulo, cada entidad se configura **dentro del módulo donde se usa**, con las mismas rutas del SPEC §6. En el prototipo son botones sin formulario; el formulario se diseña e implementa en la tarea H-12.

| Entidad | Dónde en el HUD | Rutas (SPEC §6) |
|---|---|---|
| Áreas | 02: "Nueva área" (cabecera) y, dentro del área, "Editar área" y "Borrar área" | `GET/POST /api/areas`, `PATCH/DELETE /api/areas/:id` |
| Procesos | 01: "Nuevo proceso" y, por tarjeta, "Editar" y "Borrar" | `GET/POST /api/processes`, `GET/PATCH/DELETE /api/processes/:id` |
| Recurrentes | 01: "Nueva tarea recurrente"; la edición se abre desde su proceso (a definir). Campos propios: modo, recurrencia, `allowDelegation`, contexto y prefetch | `GET/POST /api/recurring-tasks`, `PATCH/DELETE /api/recurring-tasks/:id` |
| Políticas de aprobación | 05: sección "Políticas de aprobación (U-01 a U-05)" con "Nueva política", "Editar" y "Borrar" | `GET/POST /api/approval-policies`, `PATCH/DELETE /api/approval-policies/:id` |
| Perfil de la empresa (zona horaria, jornada `workHours`) | Fuera del prototipo (a definir; probablemente un panel desde la barra superior) | `GET/PATCH /api/company` |

Lo que el prototipo **no** reimplementa: los formularios completos de agente, de acción, de área, de proceso, de recurrente y de política, ni el borrado real. Sus botones "Editar", "Borrar" y "Nuevo/Nueva" solo anuncian "aquí se abriría el formulario" (con la ruta de la API), salvo "Nuevo agente", que sí tiene su selector de área para mostrar que `areaId` es obligatorio. El agente de ejemplo "Pliego" (deshabilitado y sin área) **no forma parte del seed**: está para mostrar ese estado. Las reglas de borrado ya están en el SPEC §4: 409 si el agente, el proceso o la acción están en uso (recurrentes, procesos que dirige, reportes, políticas, prefetch), y borrar al líder de un área deja `leadAgentId = null`.

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

Tiempos medidos en el prototipo (clic a HUD visible: **810–824 ms** en varias corridas; HUD completamente ensamblado a ~1,8 s).

| t (ms) | Paso | Escena 3D (punto de integración a verificar) |
|---|---|---|
| 0 | Clic o Enter en el CEO. Se marca el fondo como inerte. Se guarda el elemento que dispara (para devolver el foco). | Pausar hover y clics de la escena (ver 6.1). |
| 0–800 | **Dolly out**: la cámara se aleja y deja al CEO en el centro de la ventana despejada. El encuadre **se calcula al abrir**: se mide la ventana real del HUD, se toma la posición del CEO (50 % × 37 % de la escena) y se obtienen la escala (tope .78 en escritorio y .62 en móvil, ajustada para que el personaje quepa) y el desplazamiento; todo con `cubic-bezier(.2,.75,.2,1)`. Con movimiento reducido se aplica el **mismo encuadre final como corte instantáneo**. | Animar la posición/zoom de la cámara hacia atrás mediante `cameraHub`, con la misma curva, hasta un encuadre que ponga al CEO en el centro de la ventana. |
| 800 | Se muestra el HUD (`data-state="opening"`), se anuncia la apertura y el foco va a la pestaña activa. | Se puede bajar la tasa de render del canvas (ver 6.1). |
| 800–1400 | Los paneles entran con escalonado de 80 ms (opacidad, 14 px de desplazamiento, escala .97) y las líneas del marco y las reglas se dibujan (`stroke-dashoffset`). | |
| ~1800 | Estado `open`. Se retiran las animaciones. | |
| Cierre (Esc/botón) | Los paneles salen en orden inverso (280 ms + escalonado de 40 ms), se oculta el HUD (~470 ms), **se retira lo inerte y el foco vuelve al CEO**, y en ese momento la cámara regresa (800 ms). | Restaurar la cámara con `cameraHub`, reanudar el render completo y los eventos de la escena. |

**Movimiento reducido** (`prefers-reduced-motion: reduce`, o el interruptor del prototipo): sin dolly, sin dibujo de líneas, sin pulsos; el HUD aparece con un fundido de 120 ms. Medido: HUD visible 82–108 ms tras el clic. La cámara se mantiene en su sitio (en 3D es lo más seguro) y la ventana despejada enseña al CEO sin acercarlo.

**Encuadre medido** (centro del botón del CEO y su caja contra la ventana despejada; el personaje queda dentro de la ventana, sin tapar por la barra superior ni por el rótulo, con y sin movimiento reducido, que da la misma posición):

| Ancho × alto | CEO (x, y) | Ventana (izq., arriba, der., abajo) |
|---|---|---|
| 1920 × 1080 | (868, 271) | (146, 96, 1590, 431) |
| 1440 × 900 | (628, 243) | (146, 96, 1110, 375) |
| 1024 × 768 | (420, 234) | (146, 107, 694, 345) |
| 390 × 844 | (195, 178) | (8, 107, 382, 233) |
| 320 × 640 | (160, 209) | (8, 153, 312, 249) |

En móvil el rótulo "OFICINA · CEO" se oculta (la franja es de 15vh) para no tapar al personaje: a 320 px lo cubría.

**Escape durante el dolly** cancela la apertura: se quita el encuadre, se libera el fondo, el foco vuelve al control que abrió y se anuncia "Apertura cancelada". Probado: a los 250 ms de abrir, `Esc` deja el HUD oculto, sin `inert` y con el foco en el CEO.

### 6.1 Coordinación con la escena 3D (puntos de integración a verificar)

Nada de esto existe en este checkout; hay que confirmarlo en `web/src/office3d/systems/interactionSystem.ts` (ruta **reportada por el usuario, a verificar**: ese código no está en este checkout) y alrededores antes de implementar.

1. **Cámara (`cameraHub`).** Confirmar si ofrece una API para animar posición, zoom y objetivo, y si devuelve una promesa o evento de fin. Si no, el HUD usa un temporizador de 800 ms como el prototipo. Definir el encuadre final del dolly para que el CEO quede visible detrás del HUD, y evitar que la cámara quede fuera de los límites de la escena.
2. **Clic sobre personajes existente.** Reutilizar el manejador actual: el clic en el CEO abre el HUD en lugar de abrir la ficha en el panel derecho. Confirmar cómo hoy se distingue el CEO y cómo se obtiene el agente seleccionado. **Confirmado por el usuario:** el clic en cualquier otro agente abre el HUD en la ficha de ese agente (módulo 02), con la misma transición; en ese caso la cámara debería encuadrar al agente clicado y no al CEO.
3. **Hub de accesibilidad (`a11yHub`).** Confirmar qué expone (anuncios, lista de personajes enfocables) para que el CEO sea alcanzable con teclado y para no duplicar anuncios entre `a11yHub` y la región `aria-live` del HUD. Probablemente deban compartir un único punto de anuncio.
4. **Pausa/limitación del bucle `requestAnimationFrame`.** Con el HUD abierto, la escena queda como fondo. Proponer: bajar a ~30 fps o pausar los efectos secundarios (partículas, animaciones idle), con reanudación al cerrar. Verificar si ya hay un mecanismo de pausa (por ejemplo al ocultar la pestaña).
5. **Bloqueo de hover y clics.** Mientras el HUD está abierto, el canvas no debe recibir `pointermove`/`click`. El HUD cubre toda la pantalla (`position: fixed; inset: 0`) y recibe los eventos, pero conviene también desactivar el *raycasting* para ahorrar CPU y evitar tooltips fantasma. Verificar cómo se registran esos manejadores (¿en el canvas o en `window`?).
6. **Fondo transparente sobre el canvas.** El HUD es un hermano posterior al contenedor del canvas, sin fondo propio salvo el velo radial. Los marcos de los paneles están al 50 % y el texto va sobre placas al 92 % (tarjetas al 95 %). Verificar que el canvas no esté dentro de un contenedor con `isolation`/`overflow` que lo recorte, y que el contenedor del canvas admita ser inerte (`inert`) sin afectar al render. El desenfoque de fondo (3 px) y el costo de componer sobre un canvas WebGL deben medirse en equipos modestos.
7. **Foco al abrir y cerrar.** El elemento que devuelve el foco es el control del CEO (botón real o proxy accesible). Si hoy el CEO solo existe dentro del canvas, hace falta un control HTML oculto o visible que lo represente (el prototipo usa un `<button>` superpuesto).

## 7. Accesibilidad

**Diálogo.** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apunta al título (`h2`). Mientras está abierto, la escena y su control quedan `inert`, y un listener de `Tab` atrapa el foco dentro del HUD. El foco inicial va a la pestaña del módulo activo.

**Lector de pantalla.**
- Región `aria-live="polite"` dentro del diálogo para: apertura ("Centro de mando abierto. Módulo 1 de 5…"), cambio de módulo, resolución de aprobación ("Aprobada: … Quedan 3 aprobaciones pendientes"), intento de aprobar sin la nota obligatoria, lanzamiento de tareas de la agenda y envío de solicitudes. Una segunda región fuera del diálogo anuncia el cierre.
- Pestañas con nombre accesible por contenido ("05 Ejecuciones 4 pendientes"; el contador visible es decorativo y el texto equivalente va sin coma ni separadores).
- Estados: icono (oculto a lectores) más texto siempre.
- Gauges: el SVG es `aria-hidden`; la información está en texto real ("6 de 22 tareas completadas").
- Los controles repetidos llevan `aria-label` con contexto que **comienza con el texto visible** (por ejemplo, "Aprobar Emitir factura de Nubia Ltda.").
- Errores de campo (nota obligatoria, área sin elegir): el mensaje se asocia con `aria-describedby` y se anuncia **una sola vez** por la región `aria-live`; no usan `role="alert"` para no duplicar el anuncio.

**Teclado.** Todo se opera sin mouse (sección 5). Foco visible en todos los controles; los botones recortados usan anillo interior porque `clip-path` cortaría el exterior. **Tamaños de los objetivos** (mínimo de WCAG 2.2 AA: 24×24 px): en escritorio, botones normales de 40 px de alto, botones `sm` y chips de 34 px y botones +/− del árbol de 36 px; en móvil, botones y botones +/− de 44 px y chips de 40 px.

**Foco no tapado por las barras pegajosas (WCAG 2.4.11).** En móvil la barra superior y el riel son pegajosos y cubren parte del contenido que se desplaza. Cada vez que el foco llega a un control, el navegador lo desplaza a la vista; sin ajuste, quedaba bajo una barra. Corrección: `scroll-padding-top` y `scroll-padding-bottom` en el contenedor con scroll, iguales al alto real de cada barra más 16 px, medidos al abrir y al cambiar el tamaño. **Prueba:** recorrer con `Tab` todo el HUD en los cinco módulos (más la lista de agentes del área de Marketing), a 390 y a 320 px de ancho, y comprobar en cada parada que el control enfocado no quede bajo una de las barras (120 paradas por ancho). **Sin** `scroll-padding`: 20 de 120 paradas tapadas a 390 px (por ejemplo, la nota de la bandeja y "Lanzar ahora"). **Con** `scroll-padding`: 0 de 120 a 390 px y 0 de 120 a 320 px.

**Movimiento reducido.** Ver sección 6. Se aplica con `prefers-reduced-motion` y con un interruptor en el prototipo (clase `rm` en `<html>`).

**Contraste.** Los marcos de los paneles están al **50 %** de opacidad; el texto va sobre **placas** al 92 % (y las tarjetas al 95 %), de modo que la oficina se ve entre los textos y no por debajo de ellos. Se calculó el contraste con los colores efectivos de cada elemento, componiendo todos los fondos translúcidos del HUD sobre **blanco puro y sobre negro puro** (peor caso de lo que haya detrás; el velo oscuro del HUD no se cuenta, así que el cálculo es conservador). Además de los elementos clave, se recorrieron **todos** los textos visibles de los cinco módulos (803 elementos a 1440 px y 783 a 390 px): mínimo **7,52:1** y ninguno bajo 4,5:1. Los números de los hexágonos se miden aparte, porque su fondo es un pseudo-elemento: cian `#35e0ff` sobre `#061834`, unos 10,7:1.

| Elemento | Contraste | Elemento | Contraste |
|---|---|---|---|
| Título del HUD | 15,30 | Botón primario / peligro | 11,94 / 10,27 |
| Subtítulo del módulo | 9,55 | Chip activo / inactivo | 11,94 / 13,37 |
| Rótulo de grupo (mono 12 px) | 10,57 | Badges advertencia / ok / peligro | 11,45 / 11,26 / 8,39 |
| Texto principal / atenuado en tarjeta | 13,26 / 8,28 | Indicador Simulación | 11,43 |
| Etiqueta de gauge / subtexto | 15,30 / 9,55 | Contador de la pestaña 5 | 11,25 |
| Pestaña inactiva / activa | 9,55 / 16,75 | Número del hexágono activo | 10,68 |
| Etiqueta visible de la barra de solicitud | 10,57 | Texto de los campos | 17,23 |
| **Placeholder** (barra de solicitud y notas) | 10,75 | **Borde de la barra de solicitud** | 9,46 |
| Historial: nota/error | 9,55 | **Borde del campo de nota** | 8,20 |

Mínimos exigidos: 4,5:1 para texto y 3:1 para el borde de los campos. Con los paneles al 78 % y sin placas, el texto directo sobre el marco daba 5,23:1 como mínimo; al bajar los marcos al 50 % hicieron falta las placas.

**Transparencia medida (método corregido).** La medición anterior ocultaba toda la escena (`#app`), con su degradado de fondo, y por eso exageraba. Ahora se oculta **solo la oficina** (`#sceneWrap`; queda el degradado) y se comparan capturas a 1440×900 con y sin ella, contando los píxeles que cambian más de 6/255 (y más de 12/255). Resultado: pantalla completa **6,7 %** (3,1 %); **ventana despejada 19,6 %** (11,7 %); marco del módulo 7,0 % (0,9 %); resumen, riel y barra de solicitud **0 %**.

**Decisión: la ventana despejada es el mecanismo principal para ver la oficina; los paneles son casi opacos por legibilidad.** Los marcos al 50 % no dejan ver la oficina de forma útil (0 a 7 % de los píxeles de cada panel) porque casi todo lo que hay bajo ellos es el fondo oscuro, y el texto va sobre placas. Por eso no se promete transparencia en los paneles: lo que se ve de la oficina es la ventana (más grande en esta revisión, 31vh) y lo poco que asoma entre paneles. La alternativa de abrir de verdad el marco (huecos reales entre placas) queda descartada para esta etapa.

**Colores forzados** (`forced-colors: active`): se elimina el recorte y los pseudo-elementos de borde, y los paneles, tarjetas y botones pasan a `Canvas` con borde `CanvasText`. La pestaña activa y el chip activo usan `Highlight`/`HighlightText`; los gauges usan `Highlight` y `GrayText`. Se comprobó con emulación en Chromium: todo el texto es legible y el estado activo se distingue por relleno, no solo por color. No se pudo probar en Windows con un tema de alto contraste real.

**Verificación automática.** axe-core sobre el HUD abierto en los cinco módulos y en la ficha de agente: **0 violaciones** (reglas wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa y best-practice). Quedan "incompletos" que axe no puede decidir (color-contrast por fondos translúcidos, cubierto con el cálculo de arriba; `label-content-name-mismatch` en los botones +/− del árbol, cuyo texto visible es un símbolo).

## 8. Costo en bundle

Datos de partida: el chunk diferido de la oficina 3D mide **172 409 B de 194 560 B** (margen de **22 151 B**, unos 21,6 KiB). Meter el HUD dentro de ese chunk lo dejaría sin holgura.

**Propuesta.** El HUD va en **chunks diferidos propios** (`import()` dinámico), con React y su CSS, **sin librerías nuevas**: gauges y sparklines son SVG a mano; las animaciones, CSS puro. El **núcleo** se carga en el primer clic sobre un personaje (o con `requestIdleCallback` tras cargar la oficina; **a decidir**). Los módulos y formularios menos usados se cargan al abrirlos. React ya está en el bundle principal, así que no se cuenta de nuevo.

**Presupuesto por chunk (propuesto, a calibrar con la prueba en TSX de H-03b):**

| Chunk | Contenido | Tope sin comprimir | Tope gzip |
|---|---|---|---|
| Núcleo del HUD | Diálogo, riel, barra superior, resumen (gauges), barra de solicitud, módulos 02, 04 y 05 y el CSS base | 40 KiB (40 960 B) | 12 KiB (12 288 B) |
| Módulos 01 y 03 | Procesos y recurrentes; agenda con resultados y pedidos internos | 14 KiB (14 336 B) | 4,5 KiB (4 608 B) |
| Formularios de CRUD | Agente, acción, área, proceso, recurrente y política (reutiliza `AgentForm`/`ActionForm` si ya están en el bundle principal) | 16 KiB (16 384 B) | 5 KiB (5 120 B) |
| Cambio en el chunk 3D | Solo el enganche del clic y la API de cámara | 1 KiB | n/a |
| Librerías nuevas | — | 0 | 0 |

Suma máxima: 70 KiB sin comprimir y 21,5 KiB gzip, repartidos en tres cargas bajo demanda. **El control del tope por chunk en CI es parte de H-04**, no de la verificación final (H-11): se pone junto al primer chunk y se aprieta a medida que crece.

**Medición real del prototipo** (revisión 3, script propio, `gzip -9`; es una **estimación**: el prototipo es vanilla JS no minificado, no React, y trae datos y escena de ejemplo que en producción no existen o llegan por la API):

| Parte | Bytes | gzip -9 |
|---|---|---|
| CSS del prototipo | 21 753 | 5 904 |
| CSS sin comentarios ni espacios (aprox. minificado) | 20 762 | 5 463 |
| JS del prototipo | 61 048 | 19 188 |
| — de ello: datos de ejemplo (agentes, 19 procesos, 27 recurrentes, tareas, ejecuciones, agenda, pedidos, políticas) | 18 524 | 6 015 |
| — de ello: dibujo de la escena falsa | 3 135 | 1 390 |
| HTML completo | 87 469 | 26 359 |

Lectura: quitando datos y escena, la lógica y las plantillas rondan 39,4 KB de JS (~11,8 KB gzip) más ~20,8 KB de CSS (~5,5 KB gzip). Minificado y escrito en TSX se estima, para todo el HUD, entre **48 y 56 KB sin comprimir y 15–18 KB gzip**, antes de sumar formularios reales, SSE y estados de carga y error. Eso ya supera los 16 KiB gzip que se habían propuesto para un solo chunk, y por eso el presupuesto se divide arriba. El prototipo creció con cada revisión (JS de 34,6 a 50,4, 58,0 y ahora 61,0 KB), así que conviene tratar estas cifras como piso. La tarea H-03b pide pasar un módulo a TSX y medir cuánto pesa React frente a vanilla antes de fijar los topes.

## 9. Riesgos y preguntas abiertas

**Riesgos**

1. **`clip-path` recorta sombras, `outline` y tooltips** que salgan del borde. Mitigación: anillos de foco interiores, padding suficiente y tooltips fuera de los elementos recortados.
2. **`backdrop-filter` y rendimiento** en equipos modestos con un canvas WebGL debajo. Mitigación: el desenfoque es de solo 3 px y decorativo, y se puede desactivar con una clase; el contraste del texto no depende de él (se mide sin desenfoque y sobre placas).
3. **Foco atrapado y lectores de pantalla.** El comportamiento de `aria-modal` varía entre lectores; por eso se usa también `inert` en el fondo. Hay que probar con NVDA, JAWS y VoiceOver (no se pudo en este entorno).
4. **Dolly sobre el 3D real.** El prototipo lo simula con `scale`; la cámara real puede chocar con límites de escena o tardar más.
5. **Pérdida de contexto visual.** El HUD cubre casi toda la pantalla; el usuario ya no "ve" a los agentes trabajar mientras aprueba. Mitigación en el prototipo: una ventana despejada con el CEO encuadrado (también en móvil, una franja de 15vh) (31vh en escritorio) y paneles casi opacos, la ventana cambia 19,6 % de sus píxeles al quitar la oficina y los paneles casi nada (sección 7). Falta validarlo con el 3D real; se podría añadir un modo compacto.
6. **Escala de datos.** 19 procesos, 27 recurrentes y 8 áreas caben; con 30 áreas o cientos de tareas hacen falta paginación o virtualización. Con el HUD en un panel de ~460 px de alto a 1440×900, los módulos largos se leen con scroll interno.
7. **Móvil:** la barra superior mide 89 px a 390 px de ancho y 135 px a 320 px (el título se parte en dos líneas), y con el riel (87 y 78 px) deja poco alto útil; el `scroll-padding` evita que tapen el foco, pero conviene revisarlo en un dispositivo real.

**Preguntas abiertas**

1. ~~¿Modelo de datos de los módulos 01 y 03?~~ **Resuelta**: ya existe en el SPEC del modelo de procesos (sección 4.1 de este documento). Queda pendiente confirmar que la implementación respete esos contratos (`Process`, `RecurringTask`, `AgendaResponse`, `Area`, `ApprovalPolicy`).
2. ~~¿Quién marca una tarea del día como hecha?~~ **Resuelta**: nadie la marca; el estado se calcula (`AgendaStatus`, SPEC §5.4). Las R-DIR las ejecuta el CEO agente; el humano solo lanza las manuales ("Lanzar ahora") o las omite (`/skip`).
3. ~~¿El clic en otros personajes (no CEO) abre el HUD en su ficha de área o mantiene la ficha actual?~~ **Confirmada por el usuario:** abre el HUD en la ficha de ese agente (módulo 02), con la misma transición (secciones 4 y 6.1).
4. ~~¿Se permite borrar al CEO o a un agente con aprobaciones pendientes?~~ **Resuelta** por el SPEC §4: reglas de borrado con 409 si hay recurrentes, procesos, reportes, políticas o prefetch en uso, y borrar al líder de un área deja `leadAgentId = null` (ver sección 4).
4b. ¿Se debe ordenar la bandeja de aprobaciones por urgencia (decisión de diseño de este prototipo; el SPEC no define el orden)?
4c. ¿Hay un endpoint, o un filtro de `GET /api/tasks`, para las ejecuciones del día? Hoy el historial y el gauge "Ejecuciones de hoy" se derivarían de `TaskTree.actionRuns`.
5. ¿La precarga del chunk va en el primer clic (más simple, posible espera) o en reposo (mejor sensación, consume red)?
6. ¿El límite de 194 560 B del chunk 3D se mide en bytes sin comprimir o gzip? Hay que confirmarlo para fijar el presupuesto del HUD en la misma unidad.
7. ¿Se mantiene un panel lateral mínimo cuando el HUD está cerrado (por ejemplo, solo la barra de solicitud)?
8. ¿Hace falta tema claro o modo de alto contraste propio, más allá de `forced-colors`?
9. ¿La configuración (4.2) vive dentro de cada módulo, como se propone aquí, o como una subvista aparte? ¿Quién puede editar el perfil de la empresa (`workHours`, zona horaria)?
10. **Pregunta para el modelo de procesos:** el SPEC define la tabla `internal_requests` (entrega única) pero no un endpoint ni un campo para **listarlos**; la vista "Pedidos internos entregados hoy" necesita, por ejemplo, `GET /api/internal-requests?date=` o un campo en `AgendaResponse`. Mientras tanto, la lista del prototipo es ilustrativa.

## 10. Plan de implementación propuesto (no implementado)

| # | Tarea | Resultado | Depende de |
|---|---|---|---|
| H-02 | Reconocimiento del código 3D: `cameraHub`, `a11yHub`, clic sobre personajes, bucle de render, contenedor del canvas | Informe con las APIs reales, y respuesta a la sección 6.1 | |
| H-03 | Tokens y estilos base del HUD (CSS, `clip-path`, estados, `forced-colors`, movimiento reducido) | Archivo CSS dentro del presupuesto | |
| H-03b | Prueba temprana en TSX: pasar un módulo (p. ej. 05) a React y medir en bytes y gzip cuánto crece frente al prototipo en vanilla, para fijar los topes de la sección 8 | Medición y topes calibrados | H-03 |
| H-04 | Esqueleto del HUD en React: diálogo, trampa de foco, `inert`, riel/tablist, región `aria-live`, barra superior (con estado de conexión y modo) y gauges con datos reales. **Incluye el control del tope de bytes y gzip por chunk en CI** (sección 8) y las pruebas de foco no tapado en móvil | Chunk diferido del núcleo cargado desde el clic en un personaje, con tope vigilado en CI | H-02, H-03, H-03b |
| H-05 | Transición: dolly con `cameraHub`, ensamblado y cierre, pausa del render y bloqueo del hover/clic de la escena | Secuencia de la sección 6 sobre la oficina real | H-02, H-04 |
| H-06 | Módulo 05 Ejecuciones y aprobaciones (migra `ApprovalsPanel`, y suma la nota obligatoria, el origen de la aprobación y la urgencia) y módulo 04 Tareas de los agentes (migra `ActivityPanel`) | Paridad funcional con las pestañas actuales, más el historial derivado del día | H-04 |
| H-07 | Módulo 02 Áreas con ficha, y migración de `TeamPanel`, `ActionsPanel` y `AgentDetail` (CRUD completo; líder y apoyo; selector de `areaId`; lista de deshabilitados o sin área) | Paridad funcional del CRUD de agentes y acciones | H-04 |
| H-08 | Barra de solicitud al CEO fija dentro del HUD (migra `RequestBar`) | Solicitud desde cualquier módulo | H-04 |
| H-09 | Módulos 01 y 03: construir las vistas sobre `GET /api/processes`, `/api/recurring-tasks` y `/api/agenda` (SPEC del modelo de procesos), incluida la nota obligatoria en 05 | Módulos nuevos con datos reales | H-04, implementación del modelo de procesos |
| H-10 | Retiro del panel derecho de pestañas y limpieza del código antiguo | App sin duplicidad | H-06, H-07, H-08 |
| H-11 | Verificación final: pruebas de teclado y axe en CI, pruebas con lectores de pantalla y en dispositivo móvil real, y revisión de la transparencia con el 3D real | Lista de verificación cumplida | H-05 a H-13 |
| H-12 | Configuración (4.2): formularios de CRUD de áreas, procesos, recurrentes y políticas (incluido `allowDelegation`, contexto y prefetch) y del perfil de la empresa, sobre la API del SPEC §6; carga diferida | Chunk de formularios dentro de su tope | H-04, implementación del modelo de procesos |
| H-13 | Clic en un agente que no es el CEO (**confirmado por el usuario**): abrir el HUD en su ficha y encuadrar a ese agente con `cameraHub` | Misma transición desde cualquier personaje | H-02, H-05 |

## Apéndice: cómo se verificó el prototipo

Con Playwright (Chromium) sobre el HTML abierto desde archivo, tras la revisión 4:

- **Consola:** cero mensajes de error o advertencia en escritorio, móvil (390, 360 y 320 px) y movimiento reducido.
- **Teclado completo:** `Tab` hasta el CEO, `Enter` (HUD visible en ~823 ms), foco inicial en la pestaña 01, flechas, `Home`, `End`, atajos `1`–`5` (con roving tabindex 0 solo en la pestaña activa), área de Marketing con sus 2 agentes, ficha de Eco (clave `comunicaciones`), lista "sin área" con Pliego, "Nuevo agente" sin área (error y foco en el selector) y con área (se crea la ficha), agenda y aprobaciones. El clic en un personaje que no es el CEO abre el HUD en su ficha (foco en el título, anuncio "abierto en la ficha de Brisa") y, al cerrar, el foco vuelve a ese personaje; reabrir desde el CEO vuelve al módulo 01.
- **Agenda:** R-DIR-01 `waiting_approval`, R-DIR-02 y R-DIR-04a `done`, R-DIR-03a `running`, las demás `scheduled`; "sin delegación" en R-DIR-04a/b/c y R-DIR-05; botones de detalle por estado ("Ver plan y subtareas" en R-DIR-01 y R-DIR-03a, "Ver resultado" en R-DIR-02 y R-DIR-04a, "Ver error" en R-CLI-01); 3 pedidos internos entregados a R-DIR-02; al lanzar la R-DIR-05 perdida del lunes 23, el anuncio dice "con la fecha 2026-11-23" y la fila sale de Atrasadas; deshabilitar el área de Marketing quita R-MKT-02 de la agenda.
- **Aprobaciones:** la urgente (11,2 h hábiles, `untrusted_input`, del lunes) se aprueba con nota y los gauges pasan de 13|5|8|27 % a 12|4|8|32 % (el gauge "Ejecuciones de hoy" no cuenta la del lunes: 4 de 8 resueltas); aprobar la factura de U-02 sin nota no la resuelve (4 pendientes se mantienen, error visible, foco en la nota, un solo anuncio y sin `role="alert"`); aprobar el recordatorio de U-03 sin nota sí funciona. El nombre accesible de cada nota incluye la ejecución ("Nota (opcional) Enviar recordatorio de cobro").
- **Atajos con foco fuera del riel/módulo:** `2` escrito en la barra de solicitud queda como texto y `3` con el foco en "Cerrar" no cambia de módulo.
- **Esc con borrador:** con una nota escrita, `Esc` cierra, devuelve el foco al CEO, avisa "Se conservaron tus borradores" y al reabrir la nota sigue ahí. **Esc durante el dolly** cancela la apertura (foco en el CEO).
- **Trampa de foco:** 40 pulsaciones de `Tab` sin salir del HUD, y `Shift+Tab` dentro. El cierre con el botón también devuelve el foco al CEO.
- **Líneas:** `stroke-dashoffset` de 1 a 0 (11 de 40 muestras intermedias); con movimiento reducido, sin animación y en 0.
- **Movimiento reducido** (`reducedMotion: 'reduce'`): HUD visible en ~99 ms, encuadre final aplicado de golpe (transición de la escena en 0 s), animaciones de paneles, líneas y pulsos en `none`, fundido de 0,12 s.
- **390 y 320 px:** sin desbordamiento horizontal en la oficina ni en los cinco módulos (incluida la ficha de agente); la barra de demo queda oculta con el HUD abierto; foco no tapado en 121 paradas por ancho (0 tapadas con `scroll-padding`; 21 sin él a 390 px). El contador del hexágono 05 ya no tapa el número y ninguna etiqueta del riel se recorta a 390, 360 y 320 px (a 320 px, las pestañas miden 60 px y la fuente es de 10 px).
- **axe-core:** 0 violaciones en los cinco módulos y en la ficha de agente.
- **Contraste:** cálculo del peor caso de los elementos clave y barrido de todos los textos visibles (810 elementos a 1440 px y 785 a 390 px: mínimo 7,52:1, ninguno bajo 4,5:1), con placeholder y bordes incluidos (sección 7).
- **Transparencia:** método y cifras en la sección 7 (solo se oculta la oficina).
- **Encuadre del CEO:** dentro de la ventana despejada a 1920, 1440, 1024, 390 y 320 px, con y sin movimiento reducido (sección 6).

Los scripts de verificación no se versionan (viven fuera del repositorio).

No verificado: lectores de pantalla reales, Windows con alto contraste real, rendimiento en equipos modestos, integración con el 3D real.
