# Comparación baseline vs agent-assisted – Phase 3

## Baseline (referencia sin agente)

Para el piloto se considera un **baseline manual** de referencia:

- **Pasos manuales equivalentes:** PM (definir alcance) → Revisión técnica (TL) → Security check (pip audit o similar) → QA (ejecutar tests) → Registro de evidencia. Estimado **5 pasos** y **~15–30 min** si se hace de forma secuencial y documentada.
- **Checklist manual:** (1) Definir alcance, (2) Diseño técnico, (3) Ejecutar security check, (4) Ejecutar tests, (5) Registrar resultado.

## Métricas agent (2 runs del piloto)

| Run | Nodo final | Pasos del grafo | QA (tests) | Security (check_deps) | Evidencia |
|-----|------------|-----------------|------------|------------------------|-----------|
| 1   | qa         | pm → gate_a → techlead → security → qa | passed | ok: false (pip audit) | logs/evidence.jsonl, Run Summary |
| 2   | qa         | pm → gate_a → techlead → security → qa | passed | ok: false (pip audit) | logs/evidence.jsonl, Run Summary |

- **Tiempo por run:** ~12–16 s (ejecución en entorno local, sin Planner/Git real).
- **Pasos del grafo:** 5 nodos ejecutados (PM, Gate A, Tech Lead, Security, QA).

## Comparación resumida

| Métrica        | Baseline (manual) | Agent (piloto)   |
|----------------|-------------------|------------------|
| Pasos          | 5 (checklist)     | 5 (nodos grafo)  |
| Tiempo         | ~15–30 min        | ~12–16 s por run |
| Tests QA       | Manual            | Automático (pytest) |
| Security check | Manual            | Automático (pip audit) |
| Evidencia      | Manual            | JSONL + Run Summary automático |

Conclusión: el agente ejecuta el mismo flujo de pasos de forma automatizada y registra evidencia por run; el tiempo de ejecución es muy inferior al baseline manual para el mismo flujo.
