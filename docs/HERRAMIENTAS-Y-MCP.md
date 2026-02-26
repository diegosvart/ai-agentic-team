# Herramientas e integraciones: Git, GitHub CLI, Docker, Ollama

Resumen de **integraciones nativas** de Cursor y **MCPs recomendados** para tu stack.

---

## 1. Integraciones nativas (sin MCP)

### Git (CLI)
- **Cursor ya incluye Git**: panel de control de código fuente (`Ctrl+Shift+G`).
- **Operaciones**: stage/unstage, commit, push/pull, historial, ramas, merge, resolución de conflictos.
- **Desde el agente**: puedo ejecutar `git` en la terminal integrada (clone, status, branch, etc.).
- **Requisito**: tener Git instalado en el sistema y configurado (usuario, email). Cursor lo detecta solo.

### GitHub CLI (`gh`)
- **No hay MCP obligatorio**: `gh` se usa por terminal.
- **Desde el agente**: puedo ejecutar `gh pr create`, `gh repo clone`, etc. en la terminal.
- **Requisito**: instalar [GitHub CLI](https://cli.github.com/) y hacer `gh auth login`. Muy recomendable para PRs automáticos.

### Docker Desktop ✅
- **Ya lo tienes.** El agente puede ejecutar `docker`, `docker compose` en la terminal.
- **Opcional**: MCP de Docker para gestionar contenedores/imágenes con lenguaje natural (ver abajo).

### Ollama ✅
- **Ya lo tienes.** Para usarlo desde el agente vía terminal: `ollama run <modelo>` o API local.
- **Opcional**: MCP de Ollama para listar modelos, consultar y usar modelos locales desde el agente (ver abajo).

### Python local (opcional)
- Solo necesario si desarrollas fuera de Docker. El agente puede ejecutar `python`, `pip`, `uv`, etc. en la terminal.
- Si todo va en contenedor, no es estrictamente necesario.

---

## 2. MCPs recomendados (opcionales pero útiles)

| Herramienta | Uso nativo (terminal/UI) | MCP recomendado | Para qué sirve el MCP |
|-------------|--------------------------|-----------------|------------------------|
| **Git** | ✅ Cursor + terminal | Opcional: `git-mcp-server` o similar | Automatizar commits, ramas, diff desde el agente con herramientas estructuradas. |
| **GitHub** | ✅ `gh` en terminal | **Recomendado**: GitHub MCP oficial | PRs, issues, repos, búsqueda de código y CI/CD desde lenguaje natural. |
| **Docker** | ✅ terminal | Opcional: Docker MCP | Crear/gestionar contenedores, compose, volúmenes con instrucciones en lenguaje natural. |
| **Ollama** | ✅ terminal/API | Opcional: Ollama MCP | Listar modelos, consultar modelos locales sin salir del agente. |

---

## 3. Configuración de MCPs

La configuración puede ir en:
- **Proyecto**: `.cursor/mcp.json` (solo este repo).
- **Global**: `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`).

Después de editar, **reinicia Cursor** o usa el botón de refresco en MCP para que cargue los servidores.

### GitHub MCP (muy recomendable para PRs automáticos)

**Requisitos:** Node.js 18+ (o Docker), y un [Personal Access Token](https://github.com/settings/tokens) con scopes `repo`, `read:org`, `workflow`.

**Opción A – npx (Node):**
```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_TU_TOKEN" }
}
```

**Opción B – Docker:**
```json
"github": {
  "command": "docker",
  "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "tu_token_aqui" }
}
```

### Docker MCP (opcional)

Útil para orquestar contenedores, imágenes y Docker Compose desde el agente con lenguaje natural.

**Requisitos:** Node.js 18+, Docker Desktop en ejecución.

Ejemplo con `@edjl/docker-mcp`:
```json
"docker": {
  "command": "npx",
  "args": ["-y", "@edjl/docker-mcp"]
}
```

Herramientas típicas: contenedores (run, stop, logs, exec, ps), imágenes (build, pull, list), Docker Compose.

**Alternativa:** Docker Desktop 4.42+ incluye un MCP Toolkit integrado; puedes habilitar servidores desde Docker Desktop (Settings → MCP) en lugar de `mcp.json`.

### Ollama MCP (opcional)

**Requisitos:** Node.js, Ollama instalado y en ejecución (`ollama serve`).

Ejemplo con `@rawveg/ollama-mcp`:
```json
"ollama": {
  "command": "npx",
  "args": ["-y", "@rawveg/ollama-mcp"]
}
```

Variables de entorno opcionales: `OLLAMA_API` (por defecto `http://localhost:11434`), `PORT` si aplica.

### Git MCP (opcional)

Herramientas explícitas de Git para el agente: status, diff, commit, add, reset, log, ramas (crear, checkout).

**Requisitos:** [uv](https://docs.astral.sh/uv/) (recomendado) o Python 3.10+ con `pip install mcp-server-git`.

Ejemplo con **uvx** (recomendado):
```json
"git": {
  "command": "uvx",
  "args": ["mcp-server-git"]
}
```

Ejemplo con **pip** (si no usas uv):
```json
"git": {
  "command": "python",
  "args": ["-m", "mcp_server_git"]
}
```

No es obligatorio si usas terminal + Git integrado de Cursor.

---

## 4. Resumen rápido

| Necesidad | Acción |
|-----------|--------|
| **Git** | Usar Git integrado de Cursor + comandos `git` en terminal. Opcional: Git MCP. |
| **PRs automáticos / GitHub** | Instalar `gh`, hacer `gh auth login`. Recomendable: añadir **GitHub MCP** en `.cursor/mcp.json`. |
| **Docker** | Ya con Docker Desktop, terminal basta. Opcional: Docker MCP. |
| **Ollama** | Ya instalado; terminal/API basta. Opcional: Ollama MCP. |
| **Python local** | Solo si desarrollas fuera de Docker; el agente usa la terminal. |

En este repo tienes **`.cursor/mcp.json.example`** con todas las herramientas opcionales (GitHub, Ollama, Git, Docker). Cópialo a `.cursor/mcp.json`, sustituye el token de GitHub y, si no usas algún MCP, elimina ese bloque. **Requisitos por MCP:** GitHub → token; Ollama → Ollama en ejecución; Git → uv o Python con `mcp-server-git`; Docker → Docker Desktop en ejecución.
