from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import models
from app.admin import router as admin_router
from app.calculations import calculate
from app.database import DATABASE_URL, SessionLocal, create_db, get_db
from app.schemas import CalculationRequest, CalculationResult, HealthResponse, ScenarioCreate, ScenarioRead, ScenarioUpdate
from app.seed import seed_defaults


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_db()
    db = SessionLocal()
    try:
        seed_defaults(db)
    finally:
        db.close()
    yield


app = FastAPI(title="CalcuRate API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)


@app.get("/api/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", database=DATABASE_URL)


@app.post("/api/calculations/preview", response_model=CalculationResult)
def preview_calculation(request: CalculationRequest, db: Session = Depends(get_db)):
    return calculate(db, request)


@app.get("/api/scenarios", response_model=list[ScenarioRead])
def list_scenarios(db: Session = Depends(get_db)):
    return db.query(models.Scenario).order_by(models.Scenario.updated_at.desc()).all()


@app.post("/api/scenarios", response_model=ScenarioRead)
def create_scenario(payload: ScenarioCreate, db: Session = Depends(get_db)):
    result = calculate(db, payload.request)
    scenario = models.Scenario(
        name=payload.name,
        request_json=jsonable_encoder(payload.request),
        result_json=jsonable_encoder(result),
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@app.get("/api/scenarios/{scenario_id}", response_model=ScenarioRead)
def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = db.get(models.Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@app.put("/api/scenarios/{scenario_id}", response_model=ScenarioRead)
def update_scenario(scenario_id: int, payload: ScenarioUpdate, db: Session = Depends(get_db)):
    scenario = db.get(models.Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if payload.name is not None:
        scenario.name = payload.name
    if payload.request is not None:
        result = calculate(db, payload.request)
        scenario.request_json = jsonable_encoder(payload.request)
        scenario.result_json = jsonable_encoder(result)
    db.commit()
    db.refresh(scenario)
    return scenario


@app.delete("/api/scenarios/{scenario_id}")
def delete_scenario(scenario_id: int, db: Session = Depends(get_db)):
    scenario = db.get(models.Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    db.delete(scenario)
    db.commit()
    return {"status": "deleted"}
