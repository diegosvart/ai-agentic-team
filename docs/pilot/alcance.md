# Alcance del piloto – Phase 3

## Repo piloto

- **Proyecto:** Agentic TI OS (este repositorio).
- **Identificador:** `pilot_project_id = "agentic-ti-os"`.
- **Ruta de proyectos (workspace):** Definida en `master_plan.toml` → `[multi_project_model].projects_output_dir` (por defecto `projects/`). Override con `AGENTIC_PROJECTS_OUTPUT_DIR`.

## Flujos definidos

1. **Flujo 1 – Run hasta Gate A (sin aprobación):** Ejecución con `gate_a_approved=false`. Resultado: PM → Gate A → fin. Sirve para verificar que el gate detiene el flujo.
2. **Flujo 2 – Run completo (gate aprobado):** Ejecución con `AGENTIC_GATE_A_APPROVED=1` (o `true`). Resultado: PM → Gate A → Tech Lead → Security → QA → fin. Genera evidencia (Run Summary, QA/Security results) en `logs/`.
3. **Flujo 3 – Run completo (repetición):** Segunda ejecución del flujo 2 para demostrar entregas repetibles con evidencia por run.

## Cómo ejecutar

- Sin aprobación (flujo 1): `docker compose run --rm agentic-ti-os`
- Con aprobación (flujos 2 y 3): `docker compose run --rm -e AGENTIC_GATE_A_APPROVED=1 agentic-ti-os`

Evidencia por run: `logs/run.jsonl`, `logs/evidence.jsonl` y Run Summary en evidence.
