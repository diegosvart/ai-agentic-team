# Levantamiento de fases – Agentic TI OS

Estado de avance por fase según [master_plan.toml](master_plan.toml) y verificación en [docs/verificacion-corrob-plan-checklist.md](verificacion-corrob-plan-checklist.md).

---

## Resumen

| Fase | Nombre (plan maestro) | Estado | Duración |
|------|------------------------|--------|----------|
| **Phase 0** | Documentación completa v1 | **Alcanzada** | 1 sem |
| **Phase 1** | Core agentic + W1 Planner→PR | **Alcanzada** | 3 sem |
| **Phase 2** | QA/Sec/DevOps + reliability | **Alcanzada** | 2 sem |
| **Phase 3** | Proyecto real medible + baseline | **Alcanzada** | 2 sem |
| **Phase 4** | Power BI: dashboards (opcional) | **Pendiente** | 1 sem |

---

## Fases alcanzadas (Phase 0, 1, 2)

- **Phase 0 – Documentación:** Repo, estructura, Docker build, ADR 0001, runbook validado. Ollama N/A.
- **Phase 1 – Core MVP:** Orquestador (PM → Gate A → TL → Security → QA), persistencia RunState/SQLite, logging JSONL, Gate A, PlannerTool stub, inferencia API por defecto.
- **Phase 2 – Hardening:** QA tool (pytest), Security tool (check_deps/check_secrets), retry en inferencia, runbook operativo (sección 10), observabilidad (eval_result, evidence, run summary).
- **Phase 3 – Real Pilot:** Repo piloto (este repo), projects_output_dir configurado, 2 flujos ejecutados con evidencia, baseline vs agent, reporte de valor, criterios de autonomía (docs/pilot/).

---

## Fases que faltan por alcanzar

### Phase 3 – Proyecto real medible (2–3 flujos) + baseline productividad — CERRADA

**Duración estimada:** 2 semanas  

**Entregables (master_plan):**

- Aplicación en repos existente con entregas repetibles.
- Comparación baseline vs agent-assisted.
- Reporte de valor (evidencia + métricas).
- Criterios para ampliar autonomía en tareas de bajo riesgo.

**Definición en repo:** Criterios A3.1–A3.5 y tareas P3-0–P3-5 definidos y **cumplidos** (acceptance.toml met = true, tasks.toml status = completed).

**Estado:** Phase 3 cerrada. Ver [docs/verificacion-corrob-plan-checklist.md](docs/verificacion-corrob-plan-checklist.md) y [docs/pilot/reporte_valor_phase3.md](docs/pilot/reporte_valor_phase3.md).

---

### Phase 4 – Power BI: dashboards ejecutivos (opcional)

**Duración estimada:** 1 semana  

**Entregables (master_plan):**

- Dataset/modelo de datos.
- Dashboard productividad/throughput/calidad.
- Automatización refresh (si aplica).
- Narrativa ejecutiva para fase empresarial.

**Definición en repo:**

- Criterios: [plans/phases/04_analytics/acceptance.toml](plans/phases/04_analytics/acceptance.toml) — actualmente **TBD** (A4.1, met = false).
- Tareas: [plans/phases/04_analytics/tasks.toml](plans/phases/04_analytics/tasks.toml) — actualmente **TBD** (4.1, status = pending).

**Próximos pasos sugeridos:**

1. Definir criterios (origen de datos: Planner + logs agent; KPIs del dashboard).
2. Definir tareas (modelo de datos, reportes Power BI, refresh).
3. Ejecutar solo si Phase 3 está cerrada y hay prioridad para analytics.

---

## Orden recomendado

1. **Phase 3** (obligatoria para “proyecto real medible”).
2. **Phase 4** (opcional; depende de prioridad analytics y datos de Phase 3).

---

*Levantamiento generado a partir de master_plan.toml y verificacion-corrob-plan-checklist.md. Actualizar este documento al cerrar Phase 3 o Phase 4.*
