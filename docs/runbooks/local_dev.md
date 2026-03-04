\# Local Development Runbook

Project: Agentic TI Operating System

Mode: Multi-project

Runtime: Docker + API (default) or Ollama (local)



---



\## 1. Prerequisites



\### Required Applications



\- Git (CLI)

\- GitHub CLI (`gh`)

\- Docker Desktop (running)

\- **Inference (modo por defecto: API):** variable de entorno `OPENAI_API_KEY` configurada (ver `master_plan.toml` → `[inference.api].api_key_env`). Para usar solo Ollama local, configurar `[inference] mode = "local"` y tener Ollama en ejecución.

\- Ollama (opcional; solo si se usa modo local)

\- Cursor o Claude Code



Optional:

\- Python 3.11 local (only if debugging outside container)



---



\## 2. Create GitHub Repository



\### Step 1 – Create repo



Option A (GitHub UI):

\- Create new repo named: `agentic-ti-os`

\- Initialize empty (no README)



Option B (CLI):

gh repo create agentic-ti-os --private --source=. --remote=origin



---



\## 3. Clone Repository



git clone https://github.com/<your-user>/agentic-ti-os.git

cd agentic-ti-os



---



\## 4. Initialize Project Structure



Create required directories:



mkdir -p plans/phases/00\_documentation

mkdir -p plans/phases/01\_core\_mvp

mkdir -p docs/adr

mkdir -p docs/runbooks

mkdir -p runtime/docker

mkdir -p src

mkdir -p logs artifacts data



Commit baseline:



git add .

git commit -m "Initial project structure"

git push origin main



---



\## 5. Verify Ollama



On host:



ollama list

curl http://localhost:11434/api/tags



Expected: JSON response with model list



---



\## 6. Docker Setup



From runtime/docker:



docker compose up --build



If successful:

\- Container starts without error

\- Logs show Python process running



---



\## 7. Validate Container → Ollama connectivity



Inside container:



docker exec -it agentic-core bash

curl $OLLAMA\_BASE\_URL/api/tags



Expected: same response as host



---



\## 8. Definition of Environment Ready



Environment is ready when:



\- Repo versioned in GitHub

\- Docker container builds

\- Ollama reachable from container

\- Logs/artifacts directories mounted



---



\## 9. Phase 0 acceptance checklist



Before marking Phase 0 complete, validate all criteria from plans/phases/00\_documentation/acceptance.toml:



1. **GitHub repository exists** – Create repo (step 2) and push: `git remote add origin <url>` then `git push -u origin main`.
2. **Project structure committed** – All plans, docs, src, runtime/docker in main.
3. **Docker container builds** – From runtime/docker: `docker compose up --build` (no error).
4. **Ollama accessible from container** – From host: `docker exec -it agentic-core bash`, then inside: `curl $OLLAMA_BASE_URL/api/tags` (JSON response). Ensure runtime/docker/.env exists (copy from .env.example) with OLLAMA_BASE_URL=http://host.docker.internal:11434.
5. **ADR 0001 created** – docs/adr/0001-python-langgraph-docker.md committed.
6. **Environment validated using runbook** – Steps 5–8 executed successfully.

---

## 10. Operación local (Phase 2)

### Ejecutar el workflow en Docker

Desde la raíz del repositorio:

```bash
docker compose build
docker compose run --rm agentic-ti-os
```

Si el compose está en `runtime/docker/`:

```bash
docker compose -f runtime/docker/docker-compose.yml run --rm agentic-ti-os
```

El workflow ejecuta: PM → Gate A → Tech Lead → Security → QA. Si `gate_a_approved` no está en true, el run termina en Gate A con mensaje de aprobación pendiente.

### Ubicación de los logs

- **Logs por run:** directorio `logs/` en la raíz del proyecto (o valor de `LOG_DIR`).
- **Archivo:** `logs/run.jsonl` (formato JSONL; cada línea un evento).
- Dentro del contenedor la ruta es `/app/logs/run.jsonl` si se monta `./logs` o se usa el mismo directorio.

### Verificar que el contenedor y el workflow terminaron bien

- La salida en consola debe mostrar bien "Workflow ended at Gate A (awaiting approval)..." o "Workflow completed." sin traceback.
- Revisar `logs/run.jsonl`: debe contener líneas JSON con `workflow_start` y `workflow_end` (o equivalentes del logger).

### Re-ejecutar tras un fallo

1. Corregir la causa (env vars, tests, permisos).
2. Volver a ejecutar: `docker compose run --rm agentic-ti-os`.
3. Los resultados de QA y Security del último run quedan en el estado del grafo; para un run limpio no hace falta borrar estado (cada run es independiente).

### Troubleshooting mínimo

| Problema | Comprobación |
|----------|--------------|
| Contenedor no arranca o falla el build | `docker compose build` sin cache: `docker compose build --no-cache`. Revisar que no falte `requirements.txt` o que `.dockerignore` no excluya archivos necesarios. |
| Error de API (inference) | Definir `OPENAI_API_KEY` en el entorno del host o en un `env_file` referenciado por compose. Para runs locales sin API, el modo por defecto sigue siendo API. |
| Tests fallan en el nodo QA | Revisar que `tests/` exista y que las dependencias (p. ej. pytest) estén en `requirements.txt`. Ejecutar fuera del contenedor: `python -m pytest tests/ -v`. |
| Security check (pip audit) falla o no existe | `pip audit` requiere pip >= 21.3. Si no está disponible, el tool devuelve resumen de error; el workflow continúa y el resultado queda en `security_result`. |
| Permisos en `logs/` o `.pytest_cache` | En Windows/Linux, si hay "Permission denied", ejecutar el contenedor con otro usuario o asegurar que el directorio `logs/` sea escribible. |

### Checklist mínimo de salud

- [ ] `docker compose build` termina sin error.
- [ ] `docker compose run --rm agentic-ti-os` termina sin traceback.
- [ ] Existe `logs/run.jsonl` (o el path configurado en `LOG_DIR`) después de al menos un run.
- [ ] Variables de entorno requeridas (p. ej. `OPENAI_API_KEY` para modo API) están definidas si se usa inferencia API.

---

## 11. Configuración de proyectos (Phase 3)

La solución usa una **carpeta base donde crear o generar nuevos proyectos** (workspace). Por defecto viene definida en `master_plan.toml` bajo `[multi_project_model].projects_output_dir` (valor por defecto: `projects`).

- **Override por entorno:** Para usar otra ruta sin editar el TOML, defina la variable de entorno `AGENTIC_PROJECTS_OUTPUT_DIR` (ruta absoluta o relativa al directorio de trabajo).
- **Uso en código:** El módulo `src.core.projects_config.get_projects_output_dir()` devuelve la ruta (Path); cualquier lógica que cree un nuevo proyecto debe usar esta función como directorio base (p. ej. `get_projects_output_dir() / project_id`).

