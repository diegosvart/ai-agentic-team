# ADR 0002: Capa de abstracción de inferencia dual (API + Local)

## Estado
Aceptado

## Contexto
Se requiere soporte dual de inferencia: por API (comercial, con API key) y local (Ollama), sin reescribir el proyecto ni alterar lógica de negocio ni comportamiento de agentes. El modo por defecto debe ser API (API key) para el flujo principal.

## Decisión
- **Capa de abstracción:** módulo `core/inference` con `InferenceProvider` (base), `APIProvider` (OpenAI-style), `LocalProvider` (Ollama-style) y factory `get_provider(config)`.
- **Modo por defecto:** `api`. La inferencia por defecto se hace vía API key; la variable de entorno indicada en config (`api_key_env`, ej. `OPENAI_API_KEY`) debe estar definida para el flujo por defecto.
- **Configuración:** sección `[inference]` en `master_plan.toml` (o archivo de config dedicado) con `mode`, `[inference.api]` y `[inference.local]`.
- **Router:** `route_llm()` delega en `get_provider(config).generate(prompt)`; no invoca modelos directamente.
- **Fallback:** estructura preparada en factory para fallback opcional api↔local cuando `fallback_enabled` esté activo (sin lógica compleja de reintentos).

## Consecuencias
- Positivas: diseño provider-agnostic, API-first y local-ready; cambios incrementales y reversibles; un único punto de uso (router) para inferencia.
- Negativas: dependencia de `openai` para el provider API; necesidad de documentar la API key para el modo por defecto.
- Neutras: políticas y tests actualizados a proveedor por defecto `"api"`; quien quiera solo local debe configurar `mode = "local"`.
