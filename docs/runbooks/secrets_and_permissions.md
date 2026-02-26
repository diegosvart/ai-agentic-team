# Secrets and Permissions Runbook

## Alcance
Gestión de secretos y permisos para el entorno Agentic TI OS.

## Secretos
- No commitear claves ni tokens en el repositorio.
- Usar variables de entorno o un gestor de secretos (ej. `.env` desde `.env.example`).

## Permisos
- Docker: usuario en grupo `docker` o equivalente.
- Sistema de archivos: permisos de lectura/escritura en directorios de trabajo y almacenamiento.

## Referencias
- [local_dev.md](local_dev.md) para validación del entorno.
