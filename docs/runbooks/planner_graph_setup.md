# Planner Graph Setup Runbook

## Alcance
Configuración del grafo del planner y del orquestador para Agentic TI OS.

## Prerrequisitos
- Entorno validado según [local_dev.md](local_dev.md).
- LLM local (Ollama) o endpoint configurado.

## Pasos
1. Definir nodos del grafo en `src/core/orchestrator/nodes/`.
2. Configurar transiciones y gates en `src/core/orchestrator/graph.py` y `gates.py`.
3. Configurar router en `src/core/router/llm_router.py` y políticas en `policies.py`.

## Referencias
- ADR 0001 (Python, LangGraph, Docker).
- Diagramas en `docs/diagrams/`.
