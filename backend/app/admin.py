from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.schemas import (
    AdminConfig,
    MultiplierTierConfig,
    RateListConfig,
    RateYearConfig,
    SupplementRuleConfig,
    TransitionBandConfig,
    TransitionCapConfig,
)
from app.seed import seed_defaults


router = APIRouter(prefix="/api/admin", tags=["admin"])


def multiplier_to_schema(row: models.MultiplierTier) -> MultiplierTierConfig:
    return MultiplierTierConfig.model_validate(
        {
            "id": row.id,
            "code": row.code,
            "name": row.name,
            "min_rv": row.min_rv,
            "max_rv": row.max_rv,
            "min_inclusive": row.min_inclusive,
            "max_inclusive": row.max_inclusive,
            "rhl_only": row.rhl_only,
            "rate": row.rate,
        }
    )


def cap_to_schema(row: models.TransitionCap) -> TransitionCapConfig:
    return TransitionCapConfig.model_validate(
        {
            "id": row.id,
            "category": row.category,
            "cap_percent": row.cap_percent,
            "inflation_factor": row.inflation_factor,
            "appropriate_fraction": row.appropriate_fraction,
        }
    )


def supplement_to_schema(row: models.SupplementRule) -> SupplementRuleConfig:
    return SupplementRuleConfig.model_validate(
        {
            "id": row.id,
            "code": row.code,
            "name": row.name,
            "location_scope": row.location_scope,
            "min_rv": row.min_rv,
            "max_rv": row.max_rv,
            "min_inclusive": row.min_inclusive,
            "max_inclusive": row.max_inclusive,
            "rate": row.rate,
            "active": row.active,
            "source_url": row.source_url,
            "source_note": row.source_note,
        }
    )


def year_to_schema(row: models.RateYear) -> RateYearConfig:
    return RateYearConfig.model_validate(
        {
            "id": row.id,
            "label": row.label,
            "start_date": row.start_date,
            "end_date": row.end_date,
            "display_order": row.display_order,
            "inflation_factor": row.inflation_factor,
            "source_url": row.source_url,
            "source_note": row.source_note,
            "multiplier_tiers": [multiplier_to_schema(item) for item in row.multiplier_tiers],
            "transition_caps": [cap_to_schema(item) for item in row.transition_caps],
            "supplements": [supplement_to_schema(item) for item in row.supplements],
        }
    )


def band_to_schema(row: models.TransitionBand) -> TransitionBandConfig:
    return TransitionBandConfig.model_validate(
        {
            "id": row.id,
            "location_group": row.location_group,
            "category": row.category,
            "min_rv": row.min_rv,
            "max_rv": row.max_rv,
            "min_inclusive": row.min_inclusive,
            "max_inclusive": row.max_inclusive,
        }
    )


def rate_list_to_schema(row: models.RateList) -> RateListConfig:
    return RateListConfig.model_validate(
        {
            "id": row.id,
            "code": row.code,
            "name": row.name,
            "country": row.country,
            "status": row.status,
            "calculation_strategy": row.calculation_strategy,
            "start_date": row.start_date,
            "end_date": row.end_date,
            "source_url": row.source_url,
            "source_note": row.source_note,
            "verified_on": row.verified_on,
            "years": [year_to_schema(item) for item in row.years],
            "transition_bands": [band_to_schema(item) for item in row.transition_bands],
        }
    )


def config_from_db(db: Session) -> AdminConfig:
    rate_lists = db.query(models.RateList).order_by(models.RateList.start_date).all()
    return AdminConfig(rate_lists=[rate_list_to_schema(item) for item in rate_lists])


def build_rate_list(config: RateListConfig) -> models.RateList:
    rate_list = models.RateList(
        code=config.code,
        name=config.name,
        country=config.country,
        status=config.status,
        calculation_strategy=config.calculation_strategy,
        start_date=config.start_date,
        end_date=config.end_date,
        source_url=config.source_url,
        source_note=config.source_note,
        verified_on=config.verified_on,
    )
    rate_list.transition_bands = [
        models.TransitionBand(
            location_group=item.location_group,
            category=item.category,
            min_rv=item.min_rv,
            max_rv=item.max_rv,
            min_inclusive=item.min_inclusive,
            max_inclusive=item.max_inclusive,
        )
        for item in config.transition_bands
    ]
    for year_config in config.years:
        year = models.RateYear(
            label=year_config.label,
            start_date=year_config.start_date,
            end_date=year_config.end_date,
            display_order=year_config.display_order,
            inflation_factor=year_config.inflation_factor,
            source_url=year_config.source_url,
            source_note=year_config.source_note,
        )
        year.multiplier_tiers = [
            models.MultiplierTier(
                code=item.code,
                name=item.name,
                min_rv=item.min_rv,
                max_rv=item.max_rv,
                min_inclusive=item.min_inclusive,
                max_inclusive=item.max_inclusive,
                rhl_only=item.rhl_only,
                rate=item.rate,
            )
            for item in year_config.multiplier_tiers
        ]
        year.transition_caps = [
            models.TransitionCap(
                category=item.category,
                cap_percent=item.cap_percent,
                inflation_factor=item.inflation_factor,
                appropriate_fraction=item.appropriate_fraction,
            )
            for item in year_config.transition_caps
        ]
        year.supplements = [
            models.SupplementRule(
                code=item.code,
                name=item.name,
                location_scope=item.location_scope,
                min_rv=item.min_rv,
                max_rv=item.max_rv,
                min_inclusive=item.min_inclusive,
                max_inclusive=item.max_inclusive,
                rate=item.rate,
                active=item.active,
                source_url=item.source_url,
                source_note=item.source_note,
            )
            for item in year_config.supplements
        ]
        rate_list.years.append(year)
    return rate_list


@router.get("/config", response_model=AdminConfig)
def get_config(db: Session = Depends(get_db)):
    return config_from_db(db)


@router.put("/config", response_model=AdminConfig)
def replace_config(config: AdminConfig, db: Session = Depends(get_db)):
    db.query(models.SupplementRule).delete()
    db.query(models.TransitionCap).delete()
    db.query(models.MultiplierTier).delete()
    db.query(models.RateYear).delete()
    db.query(models.TransitionBand).delete()
    db.query(models.RateList).delete()
    db.commit()
    db.add_all([build_rate_list(item) for item in config.rate_lists])
    db.commit()
    return config_from_db(db)


@router.post("/seed/reset", response_model=AdminConfig)
def reset_seed_data(db: Session = Depends(get_db)):
    seed_defaults(db, reset=True)
    return config_from_db(db)
