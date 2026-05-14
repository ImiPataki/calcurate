from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Location = Literal["england", "greater_london", "city_london"]


class CalculationRequest(BaseModel):
    rate_list_code: str = "england_2023"
    location: Location = "england"
    previous_rv: Decimal = Field(..., ge=0)
    current_rv: Decimal = Field(..., ge=0)
    liability_start_date: date | None = None
    liability_end_date: date | None = None
    is_rhl: bool = False
    include_placeholders: bool = True

    @field_validator("liability_end_date")
    @classmethod
    def end_after_start(cls, value, info):
        start = info.data.get("liability_start_date")
        if value and start and value < start:
            raise ValueError("liability_end_date must be on or after liability_start_date")
        return value


class BillLine(BaseModel):
    code: str
    label: str
    amount: Decimal
    unprorated_amount: Decimal
    rateable_value: Decimal | None = None
    multiplier: Decimal | None = None
    kind: str


class SupplementBreakdown(BaseModel):
    code: str
    name: str
    amount: Decimal
    unprorated_amount: Decimal
    rate: Decimal
    rateable_value: Decimal


class AnnualCalculation(BaseModel):
    year_label: str
    year_start_date: date
    year_end_date: date
    days_charged: int
    days_in_year: int
    proration_factor: Decimal
    transition_category: str
    base_liability: Decimal
    notional_chargeable_amount: Decimal
    transitional_limit: Decimal
    transition_applies: bool
    transitional_relief: Decimal
    base_charge: Decimal
    supplements_total: Decimal
    total_before_proration: Decimal
    total: Decimal
    lines: list[BillLine]
    supplements: list[SupplementBreakdown]


class CalculationResult(BaseModel):
    rate_list_code: str
    rate_list_name: str
    calculation_strategy: str
    status: str
    inputs: CalculationRequest
    annual: list[AnnualCalculation]
    total: Decimal


class ScenarioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    request: CalculationRequest


class ScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    request: CalculationRequest | None = None


class ScenarioRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    request_json: dict[str, Any]
    result_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class MultiplierTierConfig(BaseModel):
    id: int | None = None
    code: str
    name: str
    min_rv: Decimal | None = None
    max_rv: Decimal | None = None
    min_inclusive: bool = True
    max_inclusive: bool = True
    rhl_only: bool = False
    rate: Decimal


class TransitionCapConfig(BaseModel):
    id: int | None = None
    category: str
    cap_percent: Decimal
    inflation_factor: Decimal = Decimal("1")
    appropriate_fraction: Decimal


class SupplementRuleConfig(BaseModel):
    id: int | None = None
    code: str
    name: str
    location_scope: str = "any"
    min_rv: Decimal | None = None
    max_rv: Decimal | None = None
    min_inclusive: bool = True
    max_inclusive: bool = True
    rate: Decimal
    active: bool = True
    source_url: str | None = None
    source_note: str | None = None


class RateYearConfig(BaseModel):
    id: int | None = None
    label: str
    start_date: date
    end_date: date
    display_order: int = 0
    inflation_factor: Decimal = Decimal("1")
    source_url: str | None = None
    source_note: str | None = None
    multiplier_tiers: list[MultiplierTierConfig] = []
    transition_caps: list[TransitionCapConfig] = []
    supplements: list[SupplementRuleConfig] = []


class TransitionBandConfig(BaseModel):
    id: int | None = None
    location_group: str
    category: str
    min_rv: Decimal | None = None
    max_rv: Decimal | None = None
    min_inclusive: bool = True
    max_inclusive: bool = True


class RateListConfig(BaseModel):
    id: int | None = None
    code: str
    name: str
    country: str = "England"
    status: str = "active"
    calculation_strategy: str
    start_date: date
    end_date: date
    source_url: str | None = None
    source_note: str | None = None
    verified_on: date | None = None
    years: list[RateYearConfig] = []
    transition_bands: list[TransitionBandConfig] = []


class AdminConfig(BaseModel):
    rate_lists: list[RateListConfig]


class HealthResponse(BaseModel):
    status: str
    database: str
