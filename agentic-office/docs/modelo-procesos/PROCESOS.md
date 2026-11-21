# Modelo de procesos de la empresa — "Aster Consultores"

Documento de negocio del frente "modelo - prototipo del CEO". Describe cómo se maneja una pyme de
servicios B2B con un equipo de agentes: áreas, procesos, tareas recurrentes, rutina del CEO y quién
delega y aprueba qué. Es la fuente de la que sale el modelo de datos de [SPEC.md](SPEC.md).

**Aster Consultores es una empresa ficticia.** Los nombres, montos y umbrales son de ejemplo y se
pueden cambiar sin tocar el modelo.

Convenciones:
- `P-XXX-NN` identifica un proceso. `R-XXX-NN` identifica una tarea recurrente.
- Las acciones en `código` existen hoy en el seed del MVP (`server/src/store/seed.ts`). Las marcadas
  con **(nueva)** son acciones que este modelo propone añadir.
- 🔒 = la acción requiere aprobación humana en cualquier caso (hoy `requiresApproval: true`).
- Montos en pesos chilenos (CLP), netos de impuestos.

---

## 1. La empresa

| Campo | Valor |
|-------|-------|
| Rubro | Consultoría de servicios B2B (transformación digital, procesos y datos para empresas medianas) |
| Tamaño | ~30 personas; 8 a 15 proyectos activos a la vez; ticket promedio 8–40 MM CLP por proyecto |
| Zona horaria | `America/Santiago`; jornada lunes a viernes, 09:00–18:00 |
| Moneda | CLP |
| Modelo de ingresos | Proyectos a precio cerrado (hitos facturables) y bolsas de horas mensuales (retainer) |

**Cadena de valor.** Todo proceso cuelga de alguna etapa de esta cadena:

```
Atraer ──► Vender ──► Entregar ──► Facturar y cobrar ──► Retener y crecer
(Marketing) (Comercial) (Proyectos)  (Finanzas)          (Clientes y Soporte)
                 ▲  soporte transversal: Personas · Operaciones y TI · Dirección  ▲
```

## 2. Actores

| Actor | Quién es | Qué hace en el modelo |
|-------|----------|-----------------------|
| **Dueño** | La persona que usa la app (gerente general o socio). Humano. | Fija prioridades, **aprueba** lo que tiene efecto externo, monetario o irreversible, y revisa el informe diario. |
| **Agente CEO** | El orquestador (`role: 'ceo'`, área Dirección). | Recibe solicitudes y correo, planifica, **delega** en las áreas, hace seguimiento y redacta síntesis. Prepara las aprobaciones con una recomendación, pero **no aprueba**. |
| **Agente líder de área** | Un agente de área por área (`role: 'area'`). | Ejecuta los procesos de su área con sus acciones; pide aprobación cuando corresponde. |
| **Agente de apoyo** | Agente adicional en un área (p. ej. Comunicaciones dentro de Marketing). | Ejecuta tareas que le delega el CEO; reporta al líder de su área. |
| **Responsable humano de área** *(escala)* | Jefe de área humano, cuando la empresa crece. | Aprueba dentro de los umbrales de su área (§8.3). No existe en la etapa pyme. |

**Principio rector:** los agentes ejecutan y proponen; los humanos aprueban lo que sale de la empresa,
mueve dinero o compromete a la empresa. Ningún agente aprueba la ejecución de otro.

**Excepción acotada:** un mensaje externo de bajo riesgo y con plantilla fija puede ir sin aprobación
si una política de umbral lo cubre. El único caso en esta etapa es `enviar_recordatorio_cobro`: va sin
aprobación hasta 20 MM CLP de deuda y la necesita por encima (U-03). La excepción **no aplica** en
trabajo que nace de una entrada no confiable, como el correo entrante (§8.4).

## 3. Áreas

Ocho áreas, una de ellas Dirección. Se redefinieron para el rubro B2B a partir de las seis del MVP:
se conservan las claves de los agentes existentes (para no romper planes ni pruebas) y se suman
Proyectos y Operaciones. Como `comunicaciones` pasa a un área con otro nombre, el ruteo del mock deja
de depender del nombre del área (SPEC D-M16).

| Área | Clave del área | Agente líder (clave) | Agentes de apoyo | Misión | Reporta a |
|------|----------------|----------------------|------------------|--------|-----------|
| Dirección | `direccion` | `ceo` | — | Prioridades, seguimiento, coordinación entre áreas | Dueño |
| Comercial | `comercial` | `ventas` | — | Convertir oportunidades en contratos rentables | CEO |
| Marketing y Comunicaciones | `marketing` | `marketing` | `comunicaciones` | Generar demanda calificada y cuidar la marca y los comunicados | CEO |
| Proyectos y Entrega | `proyectos` | `proyectos` **(nuevo)** | — | Entregar los proyectos a tiempo, en alcance y con margen | CEO |
| Clientes y Soporte | `clientes` | `soporte` | — | Satisfacción, soporte post-entrega, renovaciones | CEO |
| Finanzas | `finanzas` | `contabilidad` | — | Facturar, cobrar, pagar y cerrar el mes | CEO |
| Personas | `personas` | `rrhh` | — | Selección, onboarding, vacaciones, remuneraciones | CEO |
| Operaciones y TI | `operaciones` | `operaciones` **(nuevo)** | — | Herramientas, accesos, proveedores y compras | CEO |

Total: CEO + 8 agentes de área (9 de las 11 plazas que admite la oficina 3D). Quedan 2 plazas para
crecer (p. ej. Legal y Cumplimiento, Datos o una PMO).

## 4. Mapa de procesos

| Tipo | Procesos |
|------|----------|
| **Estratégicos** (dirigen) | P-DIR-01 Gestión diaria de la dirección · P-DIR-02 Revisión semanal de desempeño · P-DIR-03 Cierre y planificación mensual |
| **Operativos** (cadena de valor) | P-MKT-01 Generación de demanda · P-COM-01 Gestión de oportunidades · P-COM-02 Propuesta y contrato · P-PRY-01 Arranque de proyecto · P-PRY-02 Seguimiento de proyecto · P-PRY-03 Cierre de proyecto · P-CLI-01 Atención de solicitudes y tickets · P-CLI-02 Satisfacción y renovación |
| **Soporte** (habilitan) | P-MKT-02 Comunicaciones internas y externas · P-FIN-01 Facturación · P-FIN-02 Cobranza · P-FIN-03 Pagos y cierre mensual · P-PER-01 Selección y contratación · P-PER-02 Ciclo de vida del colaborador · P-OPS-01 Accesos y herramientas · P-OPS-02 Compras y proveedores |

## 5. Procesos por área

Formato de cada ficha: **disparador** → **pasos** → **salida**, con dueño, acciones y KPI.

### 5.1 Dirección (CEO)

**P-DIR-01 Gestión diaria de la dirección** — dueño: `ceo`. Se detalla en §6.1 (rutina diaria).

**P-DIR-02 Revisión semanal de desempeño** — dueño: `ceo`.
- Disparador: lunes 09:00.
- Pasos: 1) pide a cada área su resumen semanal; 2) consolida KPI (pipeline, horas, facturación,
  cobranza, tickets); 3) detecta desvíos contra la semana anterior; 4) propone 3 prioridades.
- Salida: informe semanal para el Dueño (es la síntesis del CEO; no usa acciones propias).
  Contexto que recibe: tareas abiertas y resúmenes que entregan las áreas.
- KPI: informe entregado antes de las 10:00.

**P-DIR-03 Cierre y planificación mensual** — dueño: `ceo`.
- Disparador: 4.º día hábil del mes, 09:30 (el cierre contable de R-FIN-04 es el 3.º).
- Pasos: 1) recibe el cierre de Finanzas (P-FIN-03); 2) revisa margen por proyecto con Proyectos;
  3) revisa pipeline con Comercial; 4) redacta el informe mensual y las metas del mes.
- Salida: informe mensual. Aprobación: el Dueño valida las metas (aprobación de documento, §8.2).

### 5.2 Comercial (`ventas`)

**P-COM-01 Gestión de oportunidades** — disparador: lead nuevo (de Marketing, correo o referido).
- Pasos: 1) `calificar_lead`; 2) agenda reunión de descubrimiento 🔒 **`agendar_reunion_comercial` (nueva)**;
  3) registra la oportunidad y su etapa; 4) si no califica, la devuelve a Marketing para nutrir.
- KPI: tiempo de primera respuesta < 1 día hábil; tasa de conversión a propuesta.

**P-COM-02 Propuesta y contrato** — disparador: oportunidad en etapa "propuesta".
- Pasos: 1) estima esfuerzo con Proyectos (consulta, no aprobación); 2) redacta la propuesta;
  3) 🔒 `enviar_propuesta`; 4) al aceptarse, pide a Finanzas el alta del cliente y a Proyectos el
  arranque (P-PRY-01).
- Aprobación: siempre (🔒); además, un importe > 30 MM CLP exige nota del Dueño (U-01, §8.3).
- KPI: tasa de cierre; margen estimado ≥ 35 %.

### 5.3 Marketing y Comunicaciones (`marketing`, apoyo `comunicaciones`)

**P-MKT-01 Generación de demanda** — dueño: `marketing`.
- Pasos: 1) plan de contenidos mensual; 2) `redactar_borrador`; 3) 🔒 `publicar_en_redes`;
  4) `consultar_metricas_campana` y entrega de leads a Comercial (`buscar_leads` lo usa Comercial).
- KPI: leads calificados por mes; costo por lead.

**P-MKT-02 Comunicaciones internas y externas** — dueño: `comunicaciones` (reporta a `marketing`).
- Pasos: 1) `redactar_comunicado`; 2) `agendar_anuncio`; 3) 🔒 `enviar_comunicado`.
- Regla: audiencia `prensa` o `clientes` siempre pasa por el Dueño; `interna` también (🔒 hoy).

### 5.4 Proyectos y Entrega (`proyectos`, nuevo)

**P-PRY-01 Arranque de proyecto** — disparador: contrato firmado.
- Pasos: 1) crea el proyecto y su plan de hitos **`crear_proyecto` (nueva)**; 2) pide accesos a
  Operaciones (P-OPS-01); 3) agenda el kickoff con el cliente 🔒 **`agendar_kickoff` (nueva)**.
- KPI: kickoff ≤ 5 días hábiles desde la firma.

**P-PRY-02 Seguimiento de proyecto** — disparador: diario y semanal (R-PRY-01, R-PRY-02).
- Pasos: 1) **`consultar_horas_proyecto` (nueva)**; 2) compara avance vs. plan; 3) marca riesgo
  (verde/ámbar/rojo); 4) si un hito está listo, pide a Finanzas la factura del hito.
- KPI: desvío de horas ≤ 10 %; hitos a tiempo.

**P-PRY-03 Cierre de proyecto** — disparador: último hito aceptado.
- Pasos: 1) acta de cierre; 2) encuesta de satisfacción (P-CLI-02); 3) libera accesos (P-OPS-01);
  4) lecciones aprendidas.

### 5.5 Clientes y Soporte (`soporte`)

**P-CLI-01 Atención de solicitudes y tickets** — disparador: correo o ticket de un cliente.
- Pasos: 1) `consultar_ticket`; 2) `buscar_faq`; 3) 🔒 `responder_cliente`; 4) si es un cambio de
  alcance, lo deriva a Comercial.
- KPI: primera respuesta < 4 h hábiles; resolución < 3 días.

**P-CLI-02 Satisfacción y renovación** — disparador: cierre de proyecto y 60 días antes del fin de un
retainer.
- Pasos: 1) encuesta NPS 🔒 **`enviar_encuesta` (nueva)**; 2) analiza respuestas; 3) propone
  renovación a Comercial.
- KPI: NPS ≥ 50; tasa de renovación de retainers.

### 5.6 Finanzas (`contabilidad`)

**P-FIN-01 Facturación** — disparador: hito aceptado o fin de mes (retainers).
- Pasos: 1) valida el hito con Proyectos; 2) 🔒 `emitir_factura`.
- KPI: facturas emitidas ≤ 2 días hábiles desde el hito.

**P-FIN-02 Cobranza** — disparador: diario (R-FIN-01).
- Pasos: 1) `consultar_saldo_cliente`; 2) recordatorio a facturas vencidas
  **`enviar_recordatorio_cobro` (nueva; sin 🔒 hasta el umbral U-03)**; 3) a los 30 días de mora, escala
  al CEO (mecanismo en §8.1).
- KPI: días de cobro (DSO) ≤ 45.

**P-FIN-03 Pagos y cierre mensual** — disparador: semanal (pagos) y día 3 hábil (cierre).
- Pasos: 1) `resumen_gastos`; 2) prepara la nómina de pagos **`programar_pago` (nueva)** 🔒;
  3) cierre contable y entrega a P-DIR-03.

### 5.7 Personas (`rrhh`)

**P-PER-01 Selección y contratación** — disparador: vacante aprobada por el Dueño.
- Pasos: 1) `buscar_candidatos`; 2) coordina entrevistas 🔒 **`agendar_entrevista` (nueva)**; 3) 🔒
  `enviar_oferta_laboral`; 4) al aceptarse, dispara onboarding (P-PER-02).

**P-PER-02 Ciclo de vida del colaborador** — onboarding, vacaciones, remuneraciones, salida.
- Pasos: 1) `consultar_vacaciones` y preparación de las solicitudes para que el Dueño las apruebe
  (la aprobación de vacaciones queda fuera de la app en esta etapa); 2) checklist de onboarding con
  Operaciones (accesos); 3) insumos de remuneraciones a Finanzas el 15.º día hábil.

### 5.8 Operaciones y TI (`operaciones`, nuevo)

**P-OPS-01 Accesos y herramientas** — alta y baja de accesos para personas y clientes.
- Pasos: 1) **`gestionar_acceso` (nueva)** 🔒 (alta o baja); 2) registra el inventario de licencias.
- Regla: toda baja por salida de un colaborador se ejecuta el mismo día.
- Además es dueña de **`leer_bandeja` (nueva, solo lectura)**: lee la bandeja de correo de la empresa.
  El sistema la ejecuta antes de R-DIR-01 y le entrega el resultado al CEO (el CEO no tiene acciones).

**P-OPS-02 Compras y proveedores** — disparador: solicitud de compra de un área.
- Pasos: 1) cotiza; 2) **`emitir_orden_compra` (nueva)** 🔒; 3) renovaciones de licencias con 30
  días de aviso.

## 6. Rutina del CEO

### 6.1 Diaria (P-DIR-01), días hábiles

| Hora | Tarea recurrente | Qué hace el agente CEO | Qué ve y decide el Dueño |
|------|------------------|------------------------|--------------------------|
| 08:30 | **R-DIR-01 Leer y triar correo** | Recibe la bandeja ya leída: el sistema ejecuta antes `leer_bandeja` (de Operaciones, solo lectura) y le entrega el resultado marcado como **dato no confiable**; clasifica cada correo (cliente, comercial, proveedor, interno, ruido); convierte lo accionable en tareas delegadas al área correcta; marca lo que necesita al Dueño. | Resumen: N correos, M delegados, K que requieren su atención. |
| 09:00 | **R-DIR-02 Resolver pendientes del día** | Recibe la agenda del día, las tareas abiertas y los resultados recientes (escalamientos y traspasos, §8.1); con eso arma la lista del día: tareas recurrentes que vencen hoy, tareas atrasadas, escalamientos de áreas y lo marcado en el correo. Resuelve lo que puede (delegando) y deja el resto priorizado. | Lista del día con estado y prioridad. |
| 12:30 (R-DIR-03a) y 17:00 (R-DIR-03b) | **R-DIR-03 Revisar tareas de los agentes** | Recibe las tareas abiertas y los resultados recientes y los recorre: detecta bloqueadas, fallidas o fuera de plazo; reintenta o reasigna creando subtareas nuevas, o lo escala al Dueño en su síntesis. | Semáforo por área y lista de bloqueos. |
| 10:00 (R-DIR-04a), 15:00 (R-DIR-04b) y 17:30 (R-DIR-04c) | **R-DIR-04 Preparar aprobaciones** | Recibe las ejecuciones en `pending_approval`, las agrupa y añade a cada una contexto y recomendación (aprobar, rechazar o pedir cambio). **No aprueba.** | Bandeja de aprobaciones ordenada; aprueba o rechaza con nota. |
| 17:45 | **R-DIR-05 Informe de cierre del día** | Resume lo hecho, lo pendiente y lo que entra mañana. | Informe breve. |

Reglas de la rutina:
- Una ejecución que lleva más de una jornada hábil (9 horas hábiles, 09:00–18:00, lunes a viernes)
  esperando aprobación es **urgente**. El sistema lo calcula y se lo muestra al CEO y al Dueño.
- Una tarea que corre varias veces al día se registra como una recurrente por horario (sufijos
  `a`, `b`, `c`): una ejecución por recurrente y día.
- Las cinco son **automáticas** (se ejecutan solas a su hora). R-DIR-04 y R-DIR-05 solo preparan
  información, y el sistema lo impone: corren sin poder delegar; R-DIR-01, R-DIR-02 y R-DIR-03 además **delegan**, y lo delegado se ejecuta con las
  reglas de aprobación normales (más la de entrada no confiable de §8.4).
- "Recibe" significa que el sistema le entrega al CEO esa información al lanzar la tarea (la agenda,
  las tareas abiertas, las aprobaciones pendientes o la salida de `leer_bandeja`). El CEO no corre
  acciones por su cuenta: planifica, delega y sintetiza, como hoy. Ninguna ejecuta acciones 🔒 sin pasar por la bandeja.

### 6.2 Semanal y mensual

| Frecuencia | Tarea | Proceso | Modo |
|------------|-------|---------|------|
| Lunes 09:00 | R-DIR-06 Revisión semanal de desempeño | P-DIR-02 | Automática |
| Viernes 16:00 | R-DIR-07 Revisión de pipeline con Comercial | P-COM-01 | Automática |
| 4.º día hábil, 09:30 | R-DIR-08 Cierre y planificación mensual | P-DIR-03 | Automática. Usa el cierre de Finanzas si ya existe; si R-FIN-04 (manual) no se lanzó, el Dueño lo ve en la agenda como pendiente y el informe del mes queda preliminar. |

## 7. Tareas recurrentes por área

| ID | Área | Tarea | Frecuencia | Hora | Proceso | Modo |
|----|------|-------|------------|------|---------|------|
| R-COM-01 | Comercial | Seguimiento de oportunidades sin contacto en 5 días | Diaria | 09:30 | P-COM-01 | Automática |
| R-COM-02 | Comercial | Actualizar etapa del pipeline | Viernes | 15:00 | P-COM-01 | Automática |
| R-MKT-01 | Marketing | Métricas de campañas y leads entregados | Lunes | 10:00 | P-MKT-01 | Automática |
| R-MKT-02 | Marketing | Plan de contenidos del mes | 5.º día hábil antes del fin de mes | 10:00 | P-MKT-01 | Manual |
| R-PRY-01 | Proyectos | Control de horas vs. plan | Diaria | 11:00 | P-PRY-02 | Automática |
| R-PRY-02 | Proyectos | Estado semanal de proyectos (semáforo) | Jueves | 16:00 | P-PRY-02 | Automática |
| R-CLI-01 | Clientes | Tickets abiertos y vencidos | Diaria | 09:15 | P-CLI-01 | Automática |
| R-CLI-02 | Clientes | Retainers que vencen en 60 días | Lunes | 11:00 | P-CLI-02 | Automática |
| R-FIN-01 | Finanzas | Facturas vencidas y recordatorios | Diaria | 10:30 | P-FIN-02 | Automática |
| R-FIN-02 | Finanzas | Programación de pagos a proveedores | Miércoles | 12:00 | P-FIN-03 | Automática (el pago es 🔒) |
| R-FIN-03 | Finanzas | Facturación de retainers | Último día hábil | 10:00 | P-FIN-01 | Automática (la factura es 🔒) |
| R-FIN-04 | Finanzas | Cierre contable del mes | 3.er día hábil | 10:00 | P-FIN-03 | Manual |
| R-PER-01 | Personas | Solicitudes de vacaciones pendientes | Diaria | 12:00 | P-PER-02 | Automática |
| R-PER-02 | Personas | Insumos de remuneraciones | 15.º día hábil | 10:00 | P-PER-02 | Manual |
| R-OPS-01 | Operaciones | Licencias que vencen en 30 días | Lunes | 12:00 | P-OPS-02 | Automática |
| R-OPS-02 | Operaciones | Revisión de accesos de salidas y cierres | Viernes | 12:00 | P-OPS-01 | Automática |

- **Automática:** el sistema crea y ejecuta la tarea a su hora.
- **Manual:** la tarea aparece en la lista del día como pendiente y alguien (el Dueño o el CEO, al
  resolver pendientes) la lanza.
- "Día hábil" considera lunes a viernes. Los feriados quedan fuera de esta etapa (pregunta abierta Q3).

## 8. Delegación y aprobación

### 8.1 Quién delega a quién

| Desde | Hacia | Cuándo |
|-------|-------|--------|
| Dueño | CEO | Toda solicitud entra por el CEO (barra de solicitud, correo, recurrentes de Dirección). |
| CEO | Cualquier agente de área habilitado | Al planificar. El CEO elige por el área y las acciones del agente. |
| Líder de área | Agente de apoyo de su área | **Etapa de escala**: hoy el CEO delega directo también en el apoyo. |
| Área | Área | No delega: pide al CEO. Las "consultas" entre áreas (p. ej. Comercial pide estimación a Proyectos) se modelan como subtareas que crea el CEO. |

**Mecanismos de esta etapa** (sin flujos nuevos en el motor):

| Lo que dice un proceso | Cómo ocurre |
|------------------------|-------------|
| "Escala al CEO" | El agente termina su subtarea con una línea `[ESCALAR] motivo` en el resultado. El sistema extrae esas líneas y se las entrega al CEO como pedidos internos en R-DIR-02 y R-DIR-03. |
| "Pide a Finanzas / a Proyectos" (traspaso) | El agente deja `[TRASPASO clave-del-área] pedido` en su resultado (p. ej. `[TRASPASO finanzas]`). El sistema lo guarda y se lo entrega **una sola vez** al CEO en su siguiente revisión que puede delegar (R-DIR-02, R-DIR-03a/b o R-DIR-06), que lo convierte en una subtarea para esa área. R-DIR-05, que no delega, no los consume. |
| "Reintenta o reasigna" | El CEO crea una subtarea nueva (no se edita la fallida). |
| "Urgente" | Se calcula por antigüedad en horas hábiles (§6.1); no se guarda. |
| "Escala al Dueño" | El CEO lo pone en su síntesis; el Dueño lo ve en el informe y en la agenda. |

### 8.2 Qué se aprueba

| Tipo | Ejemplos | Quién aprueba | Cómo se modela |
|------|----------|---------------|----------------|
| Ejecución con efecto externo | `responder_cliente`, `enviar_propuesta`, `enviar_comunicado`, `publicar_en_redes`, `enviar_oferta_laboral`, `agendar_reunion_comercial`, `agendar_kickoff`, `agendar_entrevista`, `enviar_encuesta` | Dueño | Acción 🔒 → `ActionRun` en `pending_approval` (ya existe) |
| Movimiento de dinero o efecto fiscal | `emitir_factura`, `programar_pago`, `emitir_orden_compra` | Dueño | Acción 🔒 |
| Acceso o seguridad | `gestionar_acceso` | Dueño | Acción 🔒 |
| Ejecución condicionada por monto | `enviar_recordatorio_cobro` con `monto_adeudado` > 20 MM CLP, o en trabajo con entrada no confiable | Dueño | Política de aprobación con condición sobre un parámetro (§8.3) y regla de §8.4 |
| Documento de dirección | Metas del mes (P-DIR-03), vacante nueva (P-PER-01) | Dueño | Fuera de esta etapa: hoy se resuelve como solicitud normal (pregunta abierta Q2) |
| Consulta o lectura | `consultar_*`, `buscar_*`, `leer_bandeja`, `resumen_gastos` | Nadie | Acción sin aprobación y sin efectos |
| Registro interno | `crear_proyecto`, `calificar_lead`, `redactar_*`, `agendar_anuncio` | Nadie | Acción sin aprobación, con efecto solo dentro de la empresa |

### 8.3 Umbrales (ejemplo pyme)

| Regla | Condición | Efecto |
|-------|-----------|--------|
| U-01 | `enviar_propuesta.importe` > 30 000 000 | Aprobación con nota obligatoria |
| U-02 | `emitir_factura.importe` > 15 000 000 **y** `moneda` = CLP | Aprobación con nota obligatoria |
| U-05 | `emitir_factura.moneda` ≠ CLP | Aprobación con nota obligatoria (montos en otra moneda no se comparan con umbrales en CLP) |
| U-03 | `enviar_recordatorio_cobro.monto_adeudado` > 20 000 000 | Requiere aprobación (la acción por sí sola no la pide) |
| U-04 | `programar_pago.importe` > 5 000 000 | Aprobación con nota obligatoria |

Reglas de los umbrales:
- Si el parámetro que mira la condición no viene en la llamada, la regla **se aplica** (se pide
  aprobación). Omitir un dato nunca evita la bandeja.
- U-03 confía en el monto que declara el propio agente. Es un riesgo aceptado en esta etapa: se
  corregirá cuando el conector de cobranza consulte el saldo real.
- En la etapa de escala, cada umbral lleva además **quién** aprueba según el rol: hasta el umbral,
  el responsable humano del área; por encima, el Dueño.

### 8.4 Nunca automatizar

- Ningún agente aprueba ejecuciones (ni las suyas ni las de otro).
- Ninguna tarea recurrente ejecuta acciones 🔒 sin pasar por la bandeja, aunque sea automática.
- La única excepción a "efecto externo = aprobación" es la de §2 (U-03), y se declara como política;
  no se agregan excepciones sin escribirlas aquí. Ojo: esta es una **regla de gobierno**, no algo que
  el sistema impida. Una acción creada desde la app sin 🔒 se ejecuta sola en trabajo confiable; quien
  la crea es responsable de marcarle 🔒 si tiene efecto externo.
- **Entrada no confiable:** el correo y cualquier texto de terceros llegan como datos, nunca como
  instrucciones. Se considera trabajo de entrada no confiable todo lo que nace de un mensaje entrante
  (webhook) y todo lo que delegan las recurrentes del CEO que reciben información (R-DIR-01 a
  R-DIR-06), porque esa información puede arrastrar texto de terceros de días anteriores. En ese
  trabajo **toda** acción con efecto externo pide aprobación, incluida la excepción U-03, que queda
  para el trabajo de origen confiable: solicitudes del Dueño y recurrentes que no reciben información
  (de área, como R-FIN-01, o del CEO, como R-DIR-07 y R-DIR-08).
- Las credenciales nunca viajan en parámetros ni en `connectorConfig` (ver `docs/INTEGRATIONS.md` §4).

### 8.5 RACI de procesos clave

R = ejecuta · A = rinde cuentas del resultado · C = consultado · I = informado. Las ejecuciones 🔒
las aprueba siempre el Dueño, sea quien sea el A.

| Proceso | Dueño | CEO | Comercial | Proyectos | Finanzas | Clientes |
|---------|-------|-----|-----------|-----------|----------|----------|
| P-COM-02 Propuesta y contrato | A | C | R | C | I | — |
| P-PRY-01 Arranque | I | A | C | R | I | I |
| P-FIN-01 Facturación | A | I | — | C | R | — |
| P-FIN-02 Cobranza | I | A (escala) | — | — | R | C |
| P-CLI-01 Tickets | A (respuesta 🔒) | I | C | C | — | R |
| P-DIR-01 Gestión diaria | A | R | I | I | I | I |

## 9. Cómo escala el modelo

| Etapa | Equipo | Qué cambia en el modelo | Qué no cambia |
|-------|--------|-------------------------|---------------|
| **Pyme** (esta) | 1 Dueño, CEO + 8 agentes | Un líder por área; el Dueño aprueba todo | — |
| **Mediana** | Jefes humanos por área, 2–3 agentes por área | Sub-áreas (`parentAreaId`); delegación líder → apoyo; umbrales por rol de aprobador | Procesos, recurrentes y bandeja |
| **Grupo** | Varias empresas | Una empresa por tenant (ya existe `tenantId` en todas las tablas); plantillas de procesos copiables entre empresas | Modelo por empresa |

La oficina 3D tiene plazas para 10 agentes de área + CEO: pasado ese número, las áreas siguen en el
modelo pero la oficina muestra el aviso que ya existe.

## 10. Del documento al modelo

| Concepto de este documento | Entidad en [SPEC.md](SPEC.md) |
|----------------------------|-------------------------------|
| Empresa (§1) | `Tenant` + perfil de empresa |
| Área (§3) | `Area` (nueva) y `Agent.areaId` |
| Proceso P-XXX-NN (§5) | `Process` (nueva) |
| Tarea recurrente R-XXX-NN (§6, §7) | `RecurringTask` (nueva) |
| Tarea del día, solicitud o subtarea | `Task` (existe; se amplía con origen y proceso) |
| Ejecución de una acción | `ActionRun` (existe) |
| Aprobación (§8.2) | `ActionRun` en `pending_approval` + `ApprovalPolicy` (nueva) |
| Lista del día del CEO (§6.1) | Vista calculada `GET /api/agenda` |

## 11. Supuestos y preguntas abiertas

- **S1.** El correo entra por una acción de lectura (`leer_bandeja`) del conector `internal`, simulada
  en esta etapa; la lectura real se hará con un conector de correo (ver `docs/INTEGRATIONS.md`).
- **S2.** Las acciones nuevas se crean como acciones del conector `internal` (simuladas) hasta que haya
  integraciones reales.
- **S3.** El contenido del correo es de terceros y puede intentar dar órdenes; por eso se trata como
  dato no confiable (§8.4).
- **Q1.** ¿Se renombran las claves históricas (`contabilidad` → `finanzas`, `rrhh` → `personas`)? La
  propuesta es **no** renombrarlas en esta etapa (ver SPEC, D-M03).
- **Q2.** ¿Se modelan aprobaciones de documentos o planes (no de acciones)? Propuesta: después de
  esta etapa.
- **Q3.** ¿Calendario de feriados de Chile para "día hábil"? Propuesta: después de esta etapa.
