# Criterios para ampliar autonomía en tareas de bajo riesgo

Documento alineado a [master_plan.toml § evaluation](master_plan.toml): success_signals y autonomy_promotion_rules.

## Success signals (señales de éxito)

Criterios objetivos para medir calidad (plan maestro):

- [ ] **PR aprobado sin cambios mayores** en entregas asistidas por el agente.
- [ ] **CI pass rate >= 95%** en los repos donde el agente propone cambios.
- [ ] **0 incidentes post-merge** atribuibles al agente en la ventana definida.
- [ ] **Issues no reabiertos** por defecto de calidad.
- [ ] **Tiempo ciclo reducido** vs baseline (manual o pre-agente).

## Autonomy promotion rules (reglas para ampliar autonomía)

Tras cumplimiento sostenido, se pueden ampliar tareas de bajo riesgo (plan maestro):

1. **Volumen:** Tras **N=20 entregas** con:
   - [ ] **>=80% PRs aprobados** sin cambios mayores.
   - [ ] **0 incidentes severos** atribuibles al agente en el periodo.
   - [ ] **Cumplimiento sostenido de DoD** y logs completos.

2. **Operación:** Mantener:
   - [ ] Logs estructurados (tool_calls, eval_results, approvals).
   - [ ] Evidence Pack / Run Summary por run.
   - [ ] Gates (Gate A/B) respetados según política.

3. **Uso:** Para tareas de **bajo riesgo** (p. ej. mantenimiento, docs, dependencias menores), los criterios anteriores permiten evaluar si el agente puede operar con menor supervisión (siempre dentro de la política del CTO).

## Checklist de verificación periódica

- Revisar tasa de PRs aprobados sin cambios mayores.
- Revisar incidentes post-merge atribuibles al agente.
- Verificar que DoD y logs se cumplan en cada entrega.
- Actualizar N (número de entregas) y volver a evaluar cuando N>=20.
