# Cómo ejecutar el desarrollo para que los agentes del AI Agentic Team ejecuten la tarea

## Contexto

La pregunta: **cómo se debe ejecutar el desarrollo** para que los **agentes del AI Agentic Team** ejecuten una tarea (por ejemplo: *generar informe ejecutivo de capacidades del desarrollo*).

---

## Respuesta directa a: “¿los agentes no pueden ejecutar cualquier tarea? ¿No hay un agente que defina de qué trata la solicitud y delegue?”

**Sí:** con lo implementado hasta ahora, **los agentes no pueden ejecutar cualquier tarea**. Solo ejecutan un flujo fijo (PM → Gate A → TL → Security → QA) con acciones fijas (QA = tests, Security = check_deps). No existe hoy un agente que **interprete la solicitud** (qué se pide) y **delegue** al flujo o herramienta que corresponda.

**Lo que falta:** un **agente que defina de qué trata la solicitud y en consecuencia delegue**. Es decir:

1. **Entrada:** Una solicitud o tarea en lenguaje natural o estructurado (ej. “Generar informe ejecutivo de capacidades”, o un ítem de Planner).
2. **Agente interpretador/dispatcher:** Ese agente (o nodo) lee la solicitud, la clasifica (ej. “report_generation”, “delivery_planner_to_pr”, “incident_triage”) y decide **a qué flujo o herramienta delegar**.
3. **Delegación:** En función de esa clasificación, se dispara el subgrafo o la tool correcta (generar informe, ejecutar W1, etc.), no siempre el mismo pipeline.

Hoy **no tenemos ese agente**. El nodo PM actual solo actualiza el estado (`current_node: "pm"`); no interpreta ni delega. Por eso, para que “los agentes ejecuten cualquier tarea” hace falta **añadir (o extender) ese rol**: un agente que interprete la solicitud y delegue según corresponda. La sección 5 de este documento describe cómo podría integrarse en el desarrollo.

---

## 1. Estado actual: qué hay y qué falta

### Lo que existe hoy

- **Orquestador (grafo):** PM → Gate A → Tech Lead → Security → QA. Se invoca con estado inicial fijo: `messages`, `gate_a_approved`. No recibe una “tarea” o “objetivo” como entrada.
- **Nodos:** Cada nodo hace una acción fija (PM/TL pasan estado; Security ejecuta `check_deps`; QA ejecuta tests). Ninguno lee un “tipo de tarea” ni dispara una herramienta de generación de informes.
- **CLI:** `python -m src.cli.main` (o Docker) arranca el grafo con ese estado inicial. No hay parámetro ni variable de entorno que indique “ejecutar la tarea X”.
- **Plan maestro (W1):** El input del workflow W1 está definido como “Planner task/epic”, pero la integración con Planner es stub; no hay aún una “tarea” que baje de Planner al orquestador.

En resumen: **no hay hoy un canal de entrada “tarea”** ni **ningún nodo/herramienta que realice “generar informe ejecutivo”**. Por eso los agentes no pueden “ejecutar esa tarea” dentro del flujo actual.

---

## 2. Qué hace falta para que los agentes ejecuten la tarea

Para que el AI Agentic Team “ejecute” una tarea como la del informe ejecutivo hacen falta dos cosas:

1. **Entrada de tarea (task input)**  
   Que cada ejecución del sistema reciba **qué tarea hacer** (por ejemplo: “generar informe ejecutivo de capacidades”). Eso puede ser:
   - un argumento de CLI (`--task generate_executive_report`),
   - una variable de entorno (`AGENTIC_TASK=generate_executive_report`),
   - o en el futuro un ítem de Planner que se inyecte en el estado (p. ej. `state["objective"]` o `state["payload"]["task_id"]`).

2. **Un agente o herramienta que realice la tarea**  
   Algún nodo o tool que, cuando la tarea sea “generar informe ejecutivo”:
   - reúna el contexto (docs existentes, checklist, reporte de valor, etc.),
   - genere el contenido (plantilla + datos o llamada a LLM),
   - y escriba el artefacto (p. ej. `docs/informe_ejecutivo_capacidades.md`).

Mientras no exista (1) ni (2), la “tarea” solo puede ejecutarse **fuera** del grafo (manual o con un script propio), no **por** los agentes del equipo.

---

## 3. Cómo ejecutar el desarrollo para lograrlo

Para que los agentes ejecuten esta (y otras) tareas, el desarrollo debe seguir un orden como el siguiente.

### Paso 1: Introducir la entrada de tarea

- Añadir al CLI (o al invocador del grafo) una forma de indicar **qué tarea ejecutar** en esta run:
  - **Opción A – CLI:** `python -m src.cli.main --task generate_executive_report` (y/o `-t`).
  - **Opción B – Env:** `AGENTIC_TASK=generate_executive_report` (el CLI lee la variable y la pone en el estado inicial).
- Pasar esa tarea al estado del orquestador, por ejemplo:
  - `initial["payload"] = {"task": "generate_executive_report"}`  
  o un campo dedicado: `initial["objective"]` o `initial["task_id"]`.

Así, en cada ejecución el grafo “sabe” qué tarea debe hacerse.

### Paso 2: Implementar la capacidad que realiza la tarea

Para la tarea “informe ejecutivo de capacidades”:

- **Opción 1 – Tool + nodo existente:**  
  Crear una **tool** (p. ej. `src/tools/report/tool.py`) que:
  - reciba el tipo de reporte (`generate_executive_report`),
  - lea las fuentes (checklist, levantamiento, reporte de valor, etc.),
  - genere el Markdown (plantilla rellenada o llamada a `route_llm` con prompt estructurado),
  - y guarde el archivo en `docs/informe_ejecutivo_capacidades.md`.  
  Luego que un nodo existente (p. ej. **PM** o **Tech Lead**) consulte `state["payload"]["task"]` y, si es `generate_executive_report`, invoque esta tool y guarde el resultado en el estado (p. ej. `state["report_path"]`).

- **Opción 2 – Nodo dedicado “Report”:**  
  Añadir un nodo `report` al grafo que solo se ejecute cuando la tarea sea de tipo “report”. Por ejemplo: después de PM (o después de Gate A), un arco condicional “si task == generate_executive_report → report, si no → techlead”. El nodo `report` llamaría a la misma tool anterior y escribiría el informe.

- **Opción 3 – Flujo alternativo desde el CLI:**  
  En `main()`, si `task == "generate_executive_report"`, no invocar el grafo completo sino un flujo corto: llamar directamente a la tool (o a un módulo que la use) y salir. Los “agentes” en sentido amplio serían el proceso que ejecuta el CLI con esa tarea; no hace falta tocar el grafo en una primera versión.

Recomendación práctica: **Paso 1 + Opción 1 u Opción 3**. Así se establece el contrato “tarea en entrada + resultado en docs” y luego se puede refinar (nodo dedicado, más tareas, etc.).

### Paso 3: Registrar la tarea donde corresponda

- En el **plan de fases** o en el **backlog** (Planner cuando exista): ítem tipo “Generar informe ejecutivo de capacidades del desarrollo (Phases 0–3)” con criterios de aceptación (documento en `docs/` con resumen, capacidades, métricas, próximos pasos).
- La “ejecución” por los agentes será: **disparar el CLI (o el grafo) con esa tarea** y verificar que se genere el artefacto.

### Paso 4 (opcional): Unificar con W1 / Planner

Cuando Planner esté integrado, la tarea puede venir de un ítem de Planner en lugar de CLI/env. El desarrollo anterior (entrada de tarea + tool de informe) sigue siendo válido; solo cambia el origen del valor de `task` (Planner → estado inicial).

---

## 4. Resumen: orden recomendado del desarrollo

1. **Definir contrato de tarea:** Añadir `task` (o `objective`) al estado inicial y al CLI/env.
2. **Implementar la tool de informe:** Módulo que genera `docs/informe_ejecutivo_capacidades.md` a partir de las fuentes existentes (con o sin LLM).
3. **Conectar tarea → ejecución:** En el CLI, si `task == "generate_executive_report"`, invocar la tool (y opcionalmente seguir por el grafo o no). En paralelo o después: que un nodo (PM o TL) pueda invocar la misma tool cuando la tarea venga en el estado.
4. **Probar la ejecución:** Ejecutar `python -m src.cli.main --task generate_executive_report` (o equivalente con env) y comprobar que se crea/actualiza el informe.
5. **Documentar:** En runbook o en docs, indicar que “los agentes ejecutan la tarea X” significa “ejecutar el CLI (o el grafo) con esa tarea como entrada y verificar el artefacto generado”.

Con esto, el desarrollo queda alineado con el objetivo de que **los agentes del AI Agentic Team ejecuten la tarea** de generar el informe ejecutivo (y otras tareas que se añadan con el mismo patrón: entrada de tarea + tool/nodo que la realiza).

---

## 5. Agente que interpreta la solicitud y delega (diseño objetivo)

Para que los agentes **sí puedan ejecutar cualquier tarea** (dentro de las capacidades implementadas), hace falta un **nodo o agente que interprete la solicitud y delegue**. Propuesta de diseño:

### Rol: “Interpretar solicitud y delegar”

- **Entrada:** `state["payload"]["request"]` o `state["objective"]` (texto libre o ítem de Planner).
- **Responsabilidad del nodo:** (1) Clasificar la solicitud en un **tipo de tarea** conocido (ej. `report_generation`, `delivery_planner_to_pr`, `incident_triage`, `unknown`). (2) Escribir en el estado el tipo resuelto (ej. `state["payload"]["task_type"] = "report_generation"`). (3) Opcional: si la solicitud es muy vaga, devolver “necesito más contexto” en lugar de delegar.
- **Implementación posible:** El nodo puede ser el **PM** enriquecido: recibe la solicitud, llama a una tool o a un LLM con un prompt de clasificación (dado el catálogo de tipos de tarea y la solicitud, devolver el tipo), y actualiza el estado. A continuación, el **grafo** tiene arcos condicionales que leen `task_type` y enrutan a distintos subgrafos o nodos (ej. si `report_generation` → nodo/tool de informe; si `delivery_planner_to_pr` → flujo actual PM→Gate→TL→Security→QA; si `unknown` → nodo que pide aclaración o fallback).

### Dónde colocarlo en el grafo

- **Opción A:** Primer nodo del grafo: **“triage” o “dispatch”** (o PM renombrado/ampliado). Siempre se ejecuta primero; a continuación un arco condicional según `task_type` hacia el flujo que corresponda. El flujo “delivery” actual sería una de las ramas.
- **Opción B:** Mantener PM como primer nodo pero hacer que PM **lea la solicitud, clasifique y escriba task_type**; justo después un arco condicional desde PM (o desde un nodo “gate_dispatch”) que delegue según `task_type`.

### Resumen

- **Hoy:** No existe ese agente; los agentes no ejecutan “cualquier” tarea, solo un flujo fijo.
- **Objetivo:** Un agente (ej. PM o nodo “dispatch”) que **defina de qué trata la solicitud** y **delegue** al flujo o herramienta que corresponda. El desarrollo para “ejecutar cualquier tarea” pasa por implementar ese interpretador/delegador y los arcos condicionales que conecten cada `task_type` con la capacidad correcta.
