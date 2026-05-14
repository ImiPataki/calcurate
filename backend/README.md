# CalcuRate Backend

FastAPI API for CalcuRate calculations, saved scenarios, and admin-managed rating configuration.

## Install Dependencies

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

## Start The Backend

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --app-dir backend --host 127.0.0.1 --port 8000
```

The API will be available at:

```text
http://127.0.0.1:8000
```

Health check:

```text
http://127.0.0.1:8000/api/health
```

## Run Tests

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend
```

