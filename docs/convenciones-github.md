# Convenciones GitHub – Agentic TI OS

Documento de corroboración (Paso 0 del plan de verificación). Actualizar cuando se definan workflows o CONTRIBUTING formal.

## Estado verificado

- **Rama por defecto:** `main`
- **Ramas remotas:** `origin/main`
- **`.github/`:** No existe (sin workflows ni branch protection configurados aún).
- **CONTRIBUTING.md:** No existe.
- **Convención de ramas:** Se aplica rama de integración `develop` y ramas feature `feature/<nombre>` (p. ej. `feature/verification-corroboration`). El trabajo se hace en feature desde `develop`; merge a `develop` (y luego a `main`) según gates del proyecto.

## Ramas creadas para este plan

- `develop`: creada desde `main` como rama de integración.
- `feature/verification-corroboration`: rama para los artefactos y verificaciones del plan de corroboración.
