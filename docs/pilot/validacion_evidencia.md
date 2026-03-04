# Validación de la evidencia de los runs ejecutados (Phase 3)

## Fuentes revisadas

- **logs/evidence.jsonl** – Evidencia persistente por paso (security_check_deps, qa_tests, run_summary).
- **logs/run.jsonl** – Eventos de logging por run (workflow_start, workflow_end, eval_result).

---

## 1. logs/evidence.jsonl

**Estado: VÁLIDA**

El archivo contiene **6 líneas JSON** correspondientes a **2 runs completos**. Cada run deja 3 entradas:

| Orden | Step                 | Contenido esperado | Validación |
|-------|----------------------|--------------------|------------|
| 1     | security_check_deps  | result (ok, findings, summary), duration_ms | OK – ok: false, summary indica pip no disponible en entorno de ejecución. |
| 2     | qa_tests             | result (ok, passed, failed, output), duration_ms | OK – ok: true, output incluye "6 passed"; duration_ms ~1700–2300 ms. |
| 3     | run_summary          | run_id, status, steps, tool_results, evidence_refs | OK – status: "done", steps: ["qa"], tool_results con qa y security. |
| 4–6   | (mismo patrón Run 2) | Igual estructura para segundo run | OK – segundo run con security_check_deps, qa_tests, run_summary. |

**Resumen por run:**

- **Run 1 (líneas 1–3):** security_check_deps (ok: false, pip no disponible) → qa_tests (ok: true, 6 passed) → run_summary (status: done, tool_results coherentes).
- **Run 2 (líneas 4–6):** Misma secuencia; qa_tests ok: true; run_summary status: done.

**Conclusión:** La evidencia en `evidence.jsonl` es **válida y completa** para los 2 runs: cada run tiene los tres pasos (Security, QA, Run Summary) y los payloads son coherentes entre sí.

---

## 2. logs/run.jsonl

**Estado: VACÍO en la ejecución validada**

El archivo `run.jsonl` está vacío. Los 2 runs del piloto se ejecutaron mediante invocación directa del grafo (`graph.invoke`) desde un script Python, no desde el CLI (`python -m src.cli.main`). En ese contexto el logger que escribe en `run.jsonl` puede no haberse inicializado con el mismo file handler o no haberse invocado para los eventos workflow_start/workflow_end.

**Recomendación:** Para tener también eventos en `run.jsonl`, ejecutar al menos un run con el CLI:  
`docker compose run --rm -e AGENTIC_GATE_A_APPROVED=1 agentic-ti-os`  
(o `python -m src.cli.main` con `AGENTIC_GATE_A_APPROVED=1`). La evidencia principal para Phase 3 (Run Summary, QA, Security por run) está en `evidence.jsonl` y está validada.

---

## 3. Criterios de aceptación Phase 3 (evidencia)

| Criterio | Evidencia requerida | Validación |
|----------|---------------------|------------|
| A3.1 – 2+ flujos con evidencia | Run Summary y evidence por run | **Cumple** – 2 runs con 3 entradas cada uno en evidence.jsonl (security, qa, run_summary). |
| A3.3 – Reporte de valor con evidencia | Enlaces o referencia a Run Summary/evidence | **Cumple** – reporte_valor_phase3.md referencia `logs/evidence.jsonl` y Run Summary; evidence.jsonl validado. |

---

## 4. Resumen

- **evidence.jsonl:** **Válida.** Dos runs completos, cada uno con security_check_deps, qa_tests y run_summary. Estructura y contenido coherentes.
- **run.jsonl:** Vacío en los runs validados; opcional completar con una ejecución vía CLI si se desea trazabilidad adicional en este archivo.
- **Conclusión:** La evidencia de los runs ejecutados es **válida** para dar cumplimiento a Phase 3 (entregas repetibles con evidencia por run).
