# Factibilidad: tarea para agentes — Informe ejecutivo de capacidades del desarrollo

## Pregunta

¿Es factible generar una **tarea para los agentes** que consista en **generar un informe ejecutivo de las capacidades del desarrollo hasta este punto**?

## Verificación: SÍ es factible

### 1. Entradas disponibles

Toda la información necesaria para el informe ya existe en el repositorio:

| Fuente | Contenido relevante |
|--------|----------------------|
| [docs/verificacion-corrob-plan-checklist.md](verificacion-corrob-plan-checklist.md) | Fases 0–3 verificadas, criterios cumplidos por fase |
| [docs/levantamiento-fases-pendientes.md](levantamiento-fases-pendientes.md) | Resumen de fases alcanzadas vs pendientes (Phase 4) |
| [docs/pilot/reporte_valor_phase3.md](reporte_valor_phase3.md) | Métricas piloto, evidencia, conclusiones |
| [docs/pilot/baseline_vs_agent.md](baseline_vs_agent.md) | Comparación baseline vs agent |
| [docs/pilot/criterios_autonomia.md](criterios_autonomia.md) | Criterios para ampliar autonomía |
| [master_plan.toml](../master_plan.toml) | Objetivos, fases, entregables, arquitectura |
| [docs/adr/](docs/adr/) | Decisiones arquitectónicas (ADR 0001, 0002) |
| [docs/runbooks/local_dev.md](runbooks/local_dev.md) | Operación y configuración (incl. projects_output_dir) |

Un agente (o un script) con acceso a estos artefactos puede **sintetizar** un informe ejecutivo sin necesidad de inventar datos.

### 2. Salida esperada

- **Formato:** Documento corto (1–3 páginas) en Markdown o PDF.
- **Contenido típico de un informe ejecutivo de capacidades:**
  - Resumen ejecutivo (2–3 líneas).
  - Estado del desarrollo: fases alcanzadas (0–3) y pendientes (4).
  - Capacidades técnicas actuales: orquestador, tools (QA, Security, inferencia API), observabilidad, gates, configuración de proyectos.
  - Resultados del piloto: runs, evidencia, métricas (baseline vs agent).
  - Próximos pasos (Phase 4 opcional, criterios de autonomía).
  - Referencias (enlaces a docs y evidencias).

### 3. Opciones de implementación de la tarea

| Opción | Descripción | Esfuerzo | Quién ejecuta |
|--------|-------------|----------|----------------|
| **A. Tarea documentada** | Definir la tarea en lenguaje natural en un TOML o en Planner: título, descripción, criterios de aceptación, enlaces a fuentes. Un humano o un agente futuro con acceso al repo la ejecuta (redacta el informe a partir de las fuentes). | Bajo | Humano o agente con capacidad de lectura y escritura de docs |
| **B. Script o tool** | Crear un script (p. ej. `scripts/generate_executive_report.py`) o una tool que lea las fuentes anteriores, rellene una plantilla o genere un borrador en Markdown y lo guarde en `docs/informe_ejecutivo_capacidades.md`. La “tarea para los agentes” sería “ejecutar este script y revisar/commit el resultado”. | Medio | CLI o nodo que invoque el script |
| **C. Nodo/agente con LLM** | Añadir un nodo o una tool “report generator” que: (1) construya un contexto con resúmenes de los docs anteriores, (2) llame a `route_llm` con un prompt del tipo “Genera un informe ejecutivo de 1–2 páginas con…”, (3) guarde la respuesta en un archivo. La tarea sería “generar informe ejecutivo” y el flujo la dispara (p. ej. como paso post-piloto o bajo demanda). | Mayor | Nodo del orquestador o tool invocable |

Recomendación: **empezar por A** (tarea bien definida en backlog/Planner) y, si se quiere automatizar, implementar **B** (script con plantilla) sin depender de LLM; **C** tiene sentido si se desea que el informe sea redactado por el modelo a partir del contexto.

### 4. Definición propuesta de la tarea (para registro)

Para que un agente o una persona la ejecute:

- **Título:** Generar informe ejecutivo de las capacidades del desarrollo (Phases 0–3).
- **Descripción:** Redactar un documento ejecutivo (1–3 páginas) que resuma: (1) estado del desarrollo hasta la fecha (fases 0, 1, 2 y 3 cerradas), (2) capacidades técnicas entregadas (orquestador, tools, observabilidad, gates, configuración), (3) resultados del piloto Phase 3 (runs, evidencia, métricas), (4) próximos pasos (Phase 4 opcional, criterios de autonomía). El informe debe basarse en los documentos existentes en el repo (checklist, levantamiento, reporte de valor, baseline vs agent, criterios autonomía, master_plan).
- **Criterios de aceptación:** (a) Documento en `docs/informe_ejecutivo_capacidades.md` (o ruta acordada). (b) Incluye al menos: resumen ejecutivo, fases alcanzadas, capacidades técnicas, resultados piloto, próximos pasos. (c) Referencias a fuentes (enlaces o nombres de archivos).
- **Fuentes de entrada:** `docs/verificacion-corrob-plan-checklist.md`, `docs/levantamiento-fases-pendientes.md`, `docs/pilot/reporte_valor_phase3.md`, `docs/pilot/baseline_vs_agent.md`, `docs/pilot/criterios_autonomia.md`, `master_plan.toml` (secciones relevantes).

### 5. Conclusión

**Sí es factible** generar una tarea para los agentes (o para un humano) que consista en generar el informe ejecutivo de capacidades del desarrollo hasta este punto. Las entradas existen, la salida está acotada y hay varias formas de implementarla (tarea documentada, script con plantilla, o nodo con LLM). La definición propuesta anterior puede registrarse en el plan de fases, en Planner o en un backlog de tareas para su ejecución.
