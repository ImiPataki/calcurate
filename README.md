# CalcuRate

CalcuRate is a greenfield monorepo for business-rates what-if calculations.

## Stack

- `backend/`: FastAPI, Pydantic, SQLite
- `frontend/`: React without TypeScript, Vite, pnpm

## Quick Start

```powershell
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
pnpm install
pnpm dev
```

The API runs on `http://127.0.0.1:8000` and the UI runs on the Vite URL printed by `pnpm`.

## Seeded Scope

The active calculation strategy is `england_2023`, covering the 2023 rating list from 1 April 2023 to 31 March 2026. A draft `england_2026_draft` configuration is seeded for administration/reference, but its calculation method is intentionally disabled until the full method is verified.

There is no authentication in v1. Anyone who can reach the admin UI can change calculation parameters.
