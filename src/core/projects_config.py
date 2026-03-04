# Agentic TI OS – Projects config
# Ruta base donde la solución crea/genera nuevos proyectos (Phase 3).
# Override con variable de entorno AGENTIC_PROJECTS_OUTPUT_DIR.

import os
from pathlib import Path

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore

DEFAULT_PROJECTS_OUTPUT_DIR = "projects"


def get_projects_output_dir(config_path: str | Path | None = None) -> Path:
    """
    Devuelve la ruta base donde crear nuevos proyectos (workspace).
    Orden: env AGENTIC_PROJECTS_OUTPUT_DIR > master_plan.toml [multi_project_model].projects_output_dir > default 'projects'.
    """
    env_dir = os.environ.get("AGENTIC_PROJECTS_OUTPUT_DIR")
    if env_dir:
        return Path(env_dir)
    candidates = []
    if config_path:
        c = Path(config_path)
        candidates.append(c if c.is_file() else c / "master_plan.toml")
    candidates.extend([Path.cwd() / "master_plan.toml", Path.cwd().parent / "master_plan.toml"])
    for p in candidates:
        if not p.is_file():
            continue
        try:
            with open(p, "rb") as f:
                data = tomllib.load(f)
            mpm = data.get("multi_project_model") or {}
            dir_str = mpm.get("projects_output_dir")
            if dir_str:
                return Path(dir_str)
        except Exception:
            pass
    return Path(DEFAULT_PROJECTS_OUTPUT_DIR)
