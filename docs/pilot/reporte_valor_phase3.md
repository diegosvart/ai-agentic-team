# Reporte de valor – Phase 3 (Real Pilot)

## Resumen

Se ejecutaron **2 flujos completos** del workflow (PM → Gate A → Tech Lead → Security → QA) usando este repositorio como piloto, con gate aprobado y evidencia generada por run.

## Evidencia

- **Logs por run:** `logs/run.jsonl` (eventos workflow_start, workflow_end, eval_result para QA y Security).
- **Evidencia persistente:** `logs/evidence.jsonl` (entradas por run: qa_tests, security_check_deps, run_summary).
- **Run Summary:** Generado al final de cada ejecución (run_id, status, steps, tool_results) y registrado en evidence.

Cada ejecución con `AGENTIC_GATE_A_APPROVED=1` produce al menos 3 líneas en evidence (qa_tests, security_check_deps, run_summary).

## Métricas

| Run | Nodo final | QA (passed) | Security (ok) | Evidencia |
|-----|------------|-------------|---------------|-----------|
| 1   | qa         | Sí          | No (pip audit) | evidence.jsonl |
| 2   | qa         | Sí          | No (pip audit) | evidence.jsonl |

- **Número de runs:** 2.
- **Tiempo aproximado por run:** 12–16 s (entorno local).
- **Comparación con baseline:** Ver [baseline_vs_agent.md](baseline_vs_agent.md).

## Conclusiones

El piloto demuestra que el workflow se ejecuta de forma repetible con evidencia (Run Summary, QA y Security results) en cada run. La configuración de carpeta para nuevos proyectos (`projects_output_dir`) quedó definida y documentada. Los criterios para ampliar autonomía están documentados en [criterios_autonomia.md](criterios_autonomia.md). Phase 3 se considera cerrada con entregas repetibles, comparación baseline vs agent, reporte de valor y criterios de autonomía.
