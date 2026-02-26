# ADR 0001: Python, LangGraph y Docker

## Estado
Aceptado

## Contexto
Se requiere un stack ejecutable en contenedores, con orquestación por grafo y soporte LLM local (Ollama).

## Decisión
- **Lenguaje:** Python 3.11+
- **Orquestación:** LangGraph para el grafo de agentes
- **Runtime:** Docker y docker-compose para entorno reproducible

## Consecuencias
- Positivas: ecosistema Python, integración Ollama, portabilidad
- Negativas: dependencia de Docker en desarrollo local
