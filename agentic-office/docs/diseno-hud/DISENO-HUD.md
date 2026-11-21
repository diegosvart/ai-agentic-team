# H-01 · Propuesta de diseño del HUD del CEO

Estado: propuesta de diseño. No se modificó el código de la app. Prototipo: [`prototipo-hud.html`](./prototipo-hud.html) (un solo archivo, sin dependencias; ábrelo directo en el navegador). Todos los datos son ficticios (empresa "Aster Consultores", consultora B2B de unas 30 personas).

## 1. Objetivo y alcance

**Objetivo.** Reemplazar el panel derecho de pestañas (Actividad, Aprobaciones, Equipo, Acciones) y la ficha del agente por un centro de mando tipo HUD de ciencia ficción que aparece sobre la oficina 3D cuando haces clic en el CEO: la cámara se aleja y el HUD se ensambla encima, con fondo traslúcido que deja ver la oficina.

**Dentro del alcance.** Sistema visual, anatomía, cinco módulos, mapeo de funciones actuales, navegación y atajos, secuencia de transición, accesibilidad, presupuesto de bundle, riesgos y plan de implementación.

**Fuera del alcance.** Implementación en React, cambios en el servidor o en `shared`, y cualquier cambio en el código 3D (que no está en este checkout). Todo lo que toque el código 3D se marca como **punto de integración a verificar**.

**Capturas** (2x, paleta reducida a 32–64 colores para mantener cada PNG bajo 400 KB, por eso los puntos de color de los agentes se ven grisáceos; en el HTML real son de color):

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
| `--solid` / `--panel` | `#061834` / `rgba(5,20,46,.93)` | Fondo de panel. Casi opaco a propósito: garantiza contraste del texto sin importar la escena. |
| `--panel-2` | `rgba(11,36,72,.92)` | Tarjetas anidadas |
| `--line` / `--line-dim` | `#2fd4f5` / `rgba(47,212,245,.40)` | Línea de neón fina (1 px) y bordes |
| `--accent` | `#35e0ff` | Elemento activo, números, relleno de gauges |
| `--on-accent` | `#03121f` | Texto sobre fondo accent |
| `--text` / `--dim` | `#e8f7ff` / `#a8c8dd` | Texto principal / secundario |
| `--ok` `--warn` `--bad` `--info` | `#5be3a4` `#ffcf5c` `#ff8f9c` `#8cc0ff` | Estados. Nunca van solos: siempre llevan icono y texto. |
| `--focus` | `#ffffff` (oscuro sobre fondos accent) | Anillo de foco |
| Velo del HUD | `radial-gradient(rgba(2,10,26,.12) → rgba(2,8,22,.55))` | Oscurece los bordes y deja ver la oficina al centro |

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

### 2.5 Movimiento

Un solo easing, `cubic-bezier(.2,.75,.2,1)`. Dolly de 800 ms, paneles de 600 ms con escalonado de 80 ms, líneas dibujadas en 900 ms, cierre de 280 ms más escalonado. Los pulsos (anillo del CEO, punto de "Simulación") son lo único cíclico, y se apagan con movimiento reducido.

## 3. Anatomía del HUD

```
┌───────────────────────────── Barra superior (panel 0) ──────────────────────────────┐
│ CENTRO DE MANDO · Empresa    fecha        [● SIMULACIÓN] [Cerrar ✕]                 │
├──────┬────────────────────────────────────────────────────┬─────────────────────────┤
│ Riel │  Módulo activo (tabpanel, scroll interno)           │ Resumen (4 gauges)      │
│ 01   │  ┌ número + título + subtítulo ───────────────┐     │  ◯ Tareas activas       │
│ 02   │  │ contenido del módulo                        │     │  ◯ Aprobaciones pend.   │
│ 03   │  └─────────────────────────────────────────────┘     │  ◯ Ejecuciones de hoy   │
│ 04   ├────────────────────────────────────────────────────┤  ◯ % completado         │
│ 05   │  Barra "Pídele algo al CEO…"  [Enviar al CEO]       │ Actividad 12 h (spark)  │
└──────┴────────────────────────────────────────────────────┴─────────────────────────┘
```

- Rejilla de escritorio: `108px | 1fr | 292px`, filas `auto | 1fr | auto`. Escalonado de entrada por panel: topbar (0), riel (1), módulo (2), resumen (3), barra de solicitud (4).
- **Móvil (≤860 px)**: una columna con scroll vertical. Barra superior pegajosa arriba, gauges en rejilla de 2×2 sobre el módulo, módulo, barra de solicitud, y riel como barra inferior pegajosa en horizontal. Se oculta la sparkline y la fecha.
- **Gauges.** Cada uno es un anillo SVG decorativo (`aria-hidden`) más un número visible y dos textos reales: etiqueta ("Tareas activas") y equivalente textual ("11 de 17 tareas"). Definiciones: activas = tareas en cola, planificando, en curso o esperando aprobación; pendientes = ejecuciones en `pending_approval`; ejecuciones de hoy = todas las `ActionRun` del día; % completado = tareas `completed` / total.

### 3.1 Módulos

| # | Módulo | Contenido | Interacción |
|---|---|---|---|
| 01 | Procesos y tareas | Chips por área (filtro, `aria-pressed`) y tarjetas numeradas por proceso (`Process`): frecuencia, próxima ejecución, responsable y tareas recurrentes (`RecurringTask`) | Filtrar por área. En el prototipo es solo lectura. |
| 02 | Áreas de la compañía | Rejilla de 8 tarjetas: área, agente a cargo, estado, tareas activas, sparkline. Al abrir un área, se muestra la **ficha** (datos, descripción, acciones, actividad reciente) | "Abrir área" y "Volver" (el foco vuelve a la tarjeta). Botones de agente y acción. |
| 03 | Tareas del día del CEO | Agenda R-DIR-01…05 con código, hora y estado `AgendaStatus` (icono + texto), grupos "Atrasadas" y "Hoy", barra de avance (hechas u omitidas / total) y una fila "Aprobar ejecuciones pendientes: N" con acceso a 05 | "Lanzar ahora" en las tareas por lanzar o perdidas (pasan a "En curso"). "Ir a aprobaciones" salta al módulo 05. |
| 04 | Tareas de los agentes | Árbol solicitud → subtareas, con agente, estado (icono + texto) y ejecuciones asociadas. Leyenda de estados. | Expandir/contraer con botones `aria-expanded`. |
| 05 | Ejecuciones y aprobaciones | Bandeja de pendientes (parámetros, nota opcional u obligatoria según `requireNote` y política `policyId`, Aprobar/Rechazar) e historial del día con nota y error | Resolver en memoria: actualiza contadores, gauges, árbol y estado del agente, y mueve el foco a la siguiente tarjeta. Aprobar sin nota cuando es obligatoria muestra un error, mantiene la tarjeta y enfoca la nota. |

## 4. Mapeo de lo actual a los módulos nuevos

Cada fila se verificó contra `web/src/panels/` de la copia de solo lectura del MVP (`ActivityPanel`, `ApprovalsPanel`, `TeamPanel`, `ActionsPanel`, `AgentDetail`, `RequestBar`).

| Hoy | Función | Dónde queda |
|---|---|---|
| Pestaña **Actividad** | Árbol de la solicitud con sus subtareas, estado, modelo, complejidad y resultado | **04** Tareas de los agentes. Cada nodo se expande para ver detalle (modelo, complejidad, resultado, error, ejecuciones). Los badges de modelo y complejidad pasan al detalle del nodo. |
| Pestaña **Aprobaciones** | Bandeja con aprobar/rechazar, nota opcional e historial | **05** Ejecuciones y aprobaciones, con el mismo flujo e historial, más la nota obligatoria cuando `requireNote` es verdadero (SPEC §5.3). El contador de pendientes pasa a un distintivo sobre el hexágono 05 y al gauge. |
| Pestaña **Equipo** | Lista de agentes; alta, edición y borrado (con confirmación) de agentes; estado y modelo | **02** Áreas. Cada área muestra su agente. "Nuevo agente" va en la cabecera del módulo. "Editar agente" y "Borrar agente" van en la ficha. El formulario de agente (`AgentForm`) y la confirmación de borrado se reutilizan tal cual, dentro del módulo. |
| Pestaña **Acciones** | Lista y CRUD de acciones: parámetros, enum, conector, requiere aprobación, habilitada | **02**, en la ficha del agente dueño: sección "Acciones" con "Nueva acción", "Editar" y "Borrar" por fila. El formulario completo (`ActionForm`) se reutiliza. |
| **Ficha del agente** (`AgentDetail`) | Estado, acciones, tareas y ejecuciones recientes | **02**, vista de ficha del área. Se agrega el atajo "ver sus tareas" hacia 04 (a definir en implementación). |
| **Barra de solicitud al CEO** (`RequestBar`) | Escribir una solicitud y enviarla, con ejemplos | Queda **fija en la parte inferior del HUD**, visible en todos los módulos (Enter envía, Shift+Enter agrega línea). Al enviar, la solicitud aparece en 04. Los ejemplos se muestran como sugerencias cuando el campo está vacío y recibe foco. |
| Selección de agente en la oficina (hover/tooltip/clic sobre personajes) | Abre la ficha | Se conserva. El clic en el CEO abre el HUD. El clic en otro personaje puede abrir el HUD directo en la ficha de su área (**punto de integración a verificar**). |
| Tiempo real (SSE `/api/events`) | Actualiza actividad y aprobaciones | Los mismos datos alimentan 04, 05 y los gauges. El prototipo usa estado en memoria. |

Funciones nuevas (no existen hoy en el MVP): módulo 01 Procesos y tareas recurrentes, y módulo 03 Tareas del día del CEO. Ya tienen modelo y API en el SPEC del modelo de procesos ([`../modelo-procesos/SPEC.md`](../modelo-procesos/SPEC.md); procesos en [`PROCESOS.md`](../modelo-procesos/PROCESOS.md)):

### 4.1 Fuentes de datos por módulo

| Módulo | Datos | Tipos (SPEC §3) | Endpoints (SPEC §6) |
|---|---|---|---|
| 01 Procesos y tareas | Procesos por área y sus tareas recurrentes (código, modo manual/automático, hora, frecuencia) | `Process`, `RecurringTask` | `GET /api/processes` (filtro `?areaId=`), `GET /api/recurring-tasks` (filtros `?agentId=`, `?processId=`). Acciones "Lanzar ahora" y "Omitir": `POST /api/recurring-tasks/:id/run` y `/skip`. |
| 02 Áreas | Área, agente a cargo y su estado | `Area` (`StateResponse.areas`), `Agent` (con `areaId` y `reportsToAgentId`) | `GET /api/state`, `GET/POST /api/areas`, `PATCH/DELETE /api/areas/:id`, `POST/PATCH /api/agents` |
| 03 Tareas del día del CEO | Vista calculada de la agenda: las recurrentes R-DIR-01 a R-DIR-05 de PROCESOS §6.1 (leer y triar correo, resolver pendientes, revisar tareas de los agentes, preparar aprobaciones, informe de cierre), más las atrasadas | `AgendaResponse`, `AgendaItem`, `AgendaStatus` (`scheduled`, `due`, `running`, `waiting_approval`, `done`, `failed`, `skipped`, `missed`) | `GET /api/agenda?date=AAAA-MM-DD` (§5.4) |
| 04 Tareas de los agentes | Árbol solicitud → subtareas | `Task` (con `?origin=recurring` y `?processId=`), `ActionRun` | `GET /api/tasks`, SSE `/api/events` |
| 05 Ejecuciones y aprobaciones | Bandeja e historial; política que aplicó y si exige nota | `ActionRun` (campos `policyId`, `requireNote`, `resolvedBy`), `ApprovalPolicy` | `GET /api/approvals`, `POST /api/action-runs/:id/approve` (400 si `requireNote` y la nota viene vacía; rechazar no exige nota, SPEC §5.3), `GET/POST /api/approval-policies` |

Consecuencias de diseño: el módulo 03 **no** es una checklist que el humano marca; es la agenda calculada, con estados de `AgendaStatus`. Las tareas automáticas las lanza el programador; las manuales aparecen como "Por lanzar" con el botón "Lanzar ahora". Las perdidas (`missed`) se muestran en "Atrasadas". El módulo 05 exige nota para **aprobar** cuando `requireNote` es verdadero, y no para rechazar.

Lo que el prototipo **no** reimplementa: los formularios de agente y de acción. Sus botones solo anuncian "aquí se abriría el formulario". El botón "Borrar agente" aparece deshabilitado únicamente para mostrar ese estado visual; la regla real de cuándo se puede borrar es una pregunta abierta.

## 5. Navegación y atajos de teclado

Riel de módulos: `role="tablist"` con `aria-orientation` vertical en escritorio y horizontal en móvil. Cada `role="tab"` tiene `aria-controls`, `aria-selected` y `aria-keyshortcuts`. Usa **roving tabindex**: solo la pestaña activa está en el orden de Tab.

| Tecla | Efecto |
|---|---|
| `Tab` / `Shift+Tab` | Recorre los controles del HUD. El foco queda atrapado dentro del diálogo. |
| `↑` `↓` (también `←` `→`) | Cambia de módulo con activación automática y envuelve en los extremos |
| `Home` / `End` | Primer / último módulo |
| `1`–`5` | Salta al módulo y enfoca su pestaña. No actúa mientras escribes en un campo de texto. |
| `Enter` / `Espacio` | Activa botones y casillas |
| `Enter` en la barra de solicitud | Envía. `Shift+Enter` agrega línea. |
| `Esc` | Cierra el HUD y devuelve el foco al CEO |

Desde el CEO: `Tab` llega al botón "CEO — abrir centro de mando" y `Enter` o `Espacio` lo activan.

## 6. Transición de cámara, paso a paso

Tiempos medidos en el prototipo (clic a HUD visible: **817 ms**; HUD completamente ensamblado a ~1,8 s).

| t (ms) | Paso | Escena 3D (punto de integración a verificar) |
|---|---|---|
| 0 | Clic o Enter en el CEO. Se marca el fondo como inerte. Se guarda el elemento que dispara (para devolver el foco). | Pausar hover y clics de la escena (ver 6.1). |
| 0–800 | **Dolly out**: la cámara se aleja del CEO. Prototipo: `scale(.72) translateY(-3%)` más `brightness(.75)` con `cubic-bezier(.2,.75,.2,1)`. | Animar la posición/zoom de la cámara hacia atrás mediante `cameraHub`, con la misma curva. |
| 800 | Se muestra el HUD (`data-state="opening"`), se anuncia la apertura y el foco va a la pestaña activa. | Se puede bajar la tasa de render del canvas (ver 6.1). |
| 800–1400 | Los paneles entran con escalonado de 80 ms (opacidad, 14 px de desplazamiento, escala .97) y las líneas del marco y las reglas se dibujan (`stroke-dashoffset`). | |
| ~1800 | Estado `open`. Se retiran las animaciones. | |
| Cierre (Esc/botón) | Los paneles salen en orden inverso (280 ms + escalonado de 40 ms), se oculta el HUD (~470 ms), **se retira lo inerte y el foco vuelve al CEO**, y en ese momento la cámara regresa (800 ms). | Restaurar la cámara con `cameraHub`, reanudar el render completo y los eventos de la escena. |

**Movimiento reducido** (`prefers-reduced-motion: reduce`, o el interruptor del prototipo): sin dolly, sin dibujo de líneas, sin pulsos; el HUD aparece con un fundido de 120 ms. Medido: HUD visible 89 ms tras el clic; la cámara salta o se mantiene (en 3D, mejor mantenerla en su sitio).

### 6.1 Coordinación con la escena 3D (puntos de integración a verificar)

Nada de esto existe en este checkout; hay que confirmarlo en `web/src/office3d/systems/interactionSystem.ts` y alrededores antes de implementar.

1. **Cámara (`cameraHub`).** Confirmar si ofrece una API para animar posición, zoom y objetivo, y si devuelve una promesa o evento de fin. Si no, el HUD usa un temporizador de 800 ms como el prototipo. Definir el encuadre final del dolly para que el CEO quede visible detrás del HUD, y evitar que la cámara quede fuera de los límites de la escena.
2. **Clic sobre personajes existente.** Reutilizar el manejador actual: el clic en el CEO abre el HUD en lugar de abrir la ficha en el panel derecho. Confirmar cómo hoy se distingue el CEO y cómo se obtiene el agente seleccionado.
3. **Hub de accesibilidad (`a11yHub`).** Confirmar qué expone (anuncios, lista de personajes enfocables) para que el CEO sea alcanzable con teclado y para no duplicar anuncios entre `a11yHub` y la región `aria-live` del HUD. Probablemente deban compartir un único punto de anuncio.
4. **Pausa/limitación del bucle `requestAnimationFrame`.** Con el HUD abierto, la escena queda como fondo. Proponer: bajar a ~30 fps o pausar los efectos secundarios (partículas, animaciones idle), con reanudación al cerrar. Verificar si ya hay un mecanismo de pausa (por ejemplo al ocultar la pestaña).
5. **Bloqueo de hover y clics.** Mientras el HUD está abierto, el canvas no debe recibir `pointermove`/`click`. El HUD cubre toda la pantalla (`position: fixed; inset: 0`) y recibe los eventos, pero conviene también desactivar el *raycasting* para ahorrar CPU y evitar tooltips fantasma. Verificar cómo se registran esos manejadores (¿en el canvas o en `window`?).
6. **Fondo transparente sobre el canvas.** El HUD es un hermano posterior al contenedor del canvas, sin fondo propio salvo el velo radial y los paneles casi opacos. Verificar que el canvas no esté dentro de un contenedor con `isolation`/`overflow` que lo recorte, y que el contenedor del canvas admita ser inerte (`inert`) sin afectar al render.
7. **Foco al abrir y cerrar.** El elemento que devuelve el foco es el control del CEO (botón real o proxy accesible). Si hoy el CEO solo existe dentro del canvas, hace falta un control HTML oculto o visible que lo represente (el prototipo usa un `<button>` superpuesto).

## 7. Accesibilidad

**Diálogo.** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apunta al título (`h2`). Mientras está abierto, la escena y su control quedan `inert`, y un listener de `Tab` atrapa el foco dentro del HUD. El foco inicial va a la pestaña del módulo activo.

**Lector de pantalla.**
- Región `aria-live="polite"` dentro del diálogo para: apertura ("Centro de mando abierto. Módulo 1 de 5…"), cambio de módulo, resolución de aprobación ("Aprobada: … Quedan 3 aprobaciones pendientes"), rechazo de una aprobación sin la nota obligatoria, lanzamiento de tareas de la agenda y envío de solicitudes. Una segunda región fuera del diálogo anuncia el cierre.
- Pestañas con nombre accesible por contenido ("05 Ejecuciones, 2 pendientes").
- Estados: icono (oculto a lectores) más texto siempre.
- Gauges: el SVG es `aria-hidden`; la información está en texto real ("4 de 17 tareas completadas").
- Los controles repetidos llevan `aria-label` con contexto que **comienza con el texto visible** (por ejemplo, "Aprobar Emitir factura de ajuste").

**Teclado.** Todo se opera sin mouse (sección 5). Foco visible en todos los controles; los botones recortados usan anillo interior porque `clip-path` cortaría el exterior. Objetivos táctiles de 40–44 px (móvil 44 px).

**Movimiento reducido.** Ver sección 6. Se aplica con `prefers-reduced-motion` y con un interruptor en el prototipo (clase `rm` en `<html>`).

**Contraste.** Los paneles tienen fondo al 93 % de opacidad. Se calculó el contraste con los colores efectivos de cada elemento, componiendo todos los fondos translúcidos sobre blanco y sobre negro (peor caso de lo que haya detrás):

| Elemento | Contraste | Elemento | Contraste |
|---|---|---|---|
| Título del HUD | 16,84 | Botón primario | 11,94 |
| Texto principal en tarjeta | 14,33 | Botón peligro | 10,26 |
| Texto atenuado (subtítulo) | 10,51 | Chip activo / inactivo | 11,94 / 15,33 |
| Texto atenuado en tarjeta | 8,95 | Badges advertencia / ok / peligro | 11,99 / 10,85 / 8,88 |
| Etiqueta de gauge / subtexto | 16,84 / 10,51 | Indicador Simulación | 12,58 |
| Pestaña inactiva / activa | 10,51 / 18,43 | Contador de la pestaña 5 | 11,25 |
| Número del hexágono activo | 11,94 | Texto del campo | 17,23 |

El mínimo es 8,88:1 (requisito: 4,5:1; 3:1 para texto grande y componentes).

**Colores forzados** (`forced-colors: active`): se elimina el recorte y los pseudo-elementos de borde, y los paneles, tarjetas y botones pasan a `Canvas` con borde `CanvasText`. La pestaña activa y el chip activo usan `Highlight`/`HighlightText`; los gauges usan `Highlight` y `GrayText`. Se comprobó con emulación en Chromium: todo el texto es legible y el estado activo se distingue por relleno, no solo por color. No se pudo probar en Windows con un tema de alto contraste real.

**Verificación automática.** axe-core sobre el HUD abierto en los cinco módulos: **0 violaciones** (reglas wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa y best-practice). Quedan "incompletos" que axe no puede decidir (color-contrast por fondos translúcidos, cubierto con el cálculo manual de arriba; `label-content-name-mismatch` en los botones +/− del árbol, cuyo texto visible es un símbolo).

## 8. Costo en bundle

Datos de partida: el chunk diferido de la oficina 3D mide **172 409 B de 194 560 B** (margen de **22 151 B**, unos 21,6 KiB). Meter el HUD dentro de ese chunk lo dejaría sin holgura.

**Propuesta.** El HUD va en **su propio chunk diferido** (`import()` dinámico), con React y su CSS, **sin librerías nuevas**: gauges y sparklines son SVG a mano; las animaciones, CSS puro. Se precarga en el primer clic sobre el CEO (o con `requestIdleCallback` tras la carga de la oficina para que el dolly no espere la red; **a decidir**, ver preguntas abiertas). React ya está en el bundle principal, así que no se cuenta de nuevo.

**Presupuesto explícito (propuesto):**

| Concepto | Presupuesto |
|---|---|
| Chunk del HUD (JS + CSS, minificado) | ≤ 48 KiB (49 152 B) sin comprimir y ≤ 16 KiB gzip |
| Cambio en el chunk 3D | +0 B (solo el punto de enganche del clic y la API de cámara, ≤ 1 KiB, a verificar) |
| Librerías nuevas | 0 |

**Medición real del prototipo** (script propio, `gzip -9`; es una **estimación**: el prototipo es vanilla JS no minificado, no React, y trae datos y escena de ejemplo que en producción no existen):

| Parte | Bytes | gzip -9 |
|---|---|---|
| CSS del prototipo | 17 730 | 5 099 |
| CSS sin comentarios ni espacios (aprox. minificado) | 16 818 | 4 669 |
| JS del prototipo | 34 568 | 11 578 |
| — de ello: datos de ejemplo | 9 950 | 3 346 |
| — de ello: dibujo de la escena falsa | 3 101 | 1 354 |
| HTML completo | 56 458 | 17 757 |

Lectura: quitando datos y escena, la lógica y las plantillas rondan 21,5 KB de JS (~6,9 KB gzip) más ~16,8 KB de CSS (~4,7 KB gzip). Con React y TSX (mayor verbosidad, formularios reutilizados de `TeamPanel`/`ActionsPanel`, que ya existen en el bundle principal) se estima un chunk de **30–42 KB minificado y 10–14 KB gzip**, dentro del presupuesto. Si los formularios hoy viven en el chunk principal, no se duplican; si vivieran en otro, hay que revisarlo. El presupuesto debería vigilarse en CI con un límite de tamaño por chunk.

## 9. Riesgos y preguntas abiertas

**Riesgos**

1. **`clip-path` recorta sombras, `outline` y tooltips** que salgan del borde. Mitigación: anillos de foco interiores, padding suficiente y tooltips fuera de los elementos recortados.
2. **`backdrop-filter` y rendimiento** en equipos modestos con un canvas WebGL debajo. Mitigación: es decorativo y se puede desactivar con una clase; el fondo ya es casi opaco sin él.
3. **Foco atrapado y lectores de pantalla.** El comportamiento de `aria-modal` varía entre lectores; por eso se usa también `inert` en el fondo. Hay que probar con NVDA, JAWS y VoiceOver (no se pudo en este entorno).
4. **Dolly sobre el 3D real.** El prototipo lo simula con `scale`; la cámara real puede chocar con límites de escena o tardar más.
5. **Pérdida de contexto visual.** El HUD cubre casi toda la pantalla; el usuario ya no "ve" a los agentes trabajar mientras aprueba. Mitigación: la oficina se ve entre paneles y en el centro; se podría añadir un modo compacto.
6. **Escala de datos.** 24 procesos y 8 áreas caben; con 30 áreas o cientos de tareas hacen falta paginación o virtualización.
7. **Móvil:** la barra superior ocupa mucho alto en 390 px; revisar en dispositivo real.

**Preguntas abiertas**

1. ~~¿Modelo de datos de los módulos 01 y 03?~~ **Resuelta**: ya existe en el SPEC del modelo de procesos (sección 4.1 de este documento). Queda pendiente confirmar que la implementación respete esos contratos (`Process`, `RecurringTask`, `AgendaResponse`, `Area`, `ApprovalPolicy`).
2. ~~¿Quién marca una tarea del día como hecha?~~ **Resuelta**: nadie la marca; el estado se calcula (`AgendaStatus`, SPEC §5.4). Las R-DIR las ejecuta el CEO agente; el humano solo lanza las manuales ("Lanzar ahora") o las omite (`/skip`).
3. ¿El clic en otros personajes (no CEO) debe abrir el HUD en su ficha de área, o mantener la ficha actual?
4. ¿Se permite borrar al CEO o a un agente con aprobaciones pendientes? (El prototipo solo muestra el estado deshabilitado.)
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
| H-06 | Módulo 05 Ejecuciones y aprobaciones (migra `ApprovalsPanel`) y módulo 04 Tareas de los agentes (migra `ActivityPanel`) | Paridad funcional con las pestañas actuales | H-04 |
| H-07 | Módulo 02 Áreas con ficha, y migración de `TeamPanel`, `ActionsPanel` y `AgentDetail` (CRUD completo) | Paridad funcional del CRUD de agentes y acciones | H-04 |
| H-08 | Barra de solicitud al CEO fija dentro del HUD (migra `RequestBar`) | Solicitud desde cualquier módulo | H-04 |
| H-09 | Módulos 01 y 03: construir las vistas sobre `GET /api/processes`, `/api/recurring-tasks` y `/api/agenda` (SPEC del modelo de procesos), incluida la nota obligatoria en 05 | Módulos nuevos con datos reales | H-04, implementación del modelo de procesos |
| H-10 | Retiro del panel derecho de pestañas y limpieza del código antiguo | App sin duplicidad | H-06, H-07, H-08 |
| H-11 | Verificación: pruebas de teclado y axe en CI, presupuesto de tamaño por chunk, pruebas con lectores de pantalla y en dispositivo móvil real | Lista de verificación cumplida | H-05 a H-10 |

## Apéndice: cómo se verificó el prototipo

Con Playwright (Chromium) sobre el HTML abierto desde archivo:

- Cero mensajes de error o advertencia de consola en escritorio, móvil y movimiento reducido.
- Flujo solo con teclado: `Tab` hasta el CEO, `Enter`, foco inicial en la pestaña 01, flechas, `Home`, `End`, atajos `1`–`5`, aprobar con nota (los gauges pasan de 11|4|8|24 % a 10|3|8|29 %), 40 pulsaciones de `Tab` sin salir del HUD, `Esc` y foco de vuelta en el CEO. Lo mismo con el botón "Cerrar".
- Movimiento reducido: sin clase `dolly`, transición de la escena en 0 s, animaciones de paneles y líneas en `none`, fundido de 0,12 s.
- 390 px de ancho: sin desbordamiento horizontal en la oficina ni en los cinco módulos.
- axe-core 0 violaciones; contraste calculado (sección 7).

Tras integrar el modelo de procesos se repitió la verificación (consola sin mensajes, flujo de teclado, axe con 0 violaciones en los cinco módulos, sin desbordamiento a 390 px) y se probó que aprobar sin nota la ejecución con `requireNote` no la resuelve (muestra el error y enfoca la nota), mientras que rechazarla sin nota y aprobar otra sin `requireNote` sí funcionan.

No verificado: lectores de pantalla reales, Windows con alto contraste real, rendimiento en equipos modestos, integración con el 3D real.
