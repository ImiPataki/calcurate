from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.schemas import (
    AnnualCalculation,
    BillLine,
    CalculationRequest,
    CalculationResult,
    SupplementBreakdown,
)


PENNY = Decimal("0.01")
SIX_PLACES = Decimal("0.000001")


def money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(PENNY, rounding=ROUND_HALF_UP)


def ratio(value: Decimal) -> Decimal:
    return Decimal(value).quantize(SIX_PLACES, rounding=ROUND_HALF_UP)


def in_range(value: Decimal, minimum, maximum, min_inclusive: bool, max_inclusive: bool) -> bool:
    if minimum is not None:
        minimum = Decimal(minimum)
        if min_inclusive and value < minimum:
            return False
        if not min_inclusive and value <= minimum:
            return False
    if maximum is not None:
        maximum = Decimal(maximum)
        if max_inclusive and value > maximum:
            return False
        if not max_inclusive and value >= maximum:
            return False
    return True


def location_group(location: str) -> str:
    return "london" if location in {"greater_london", "city_london"} else "england"


def scope_matches(scope: str, location: str) -> bool:
    if scope == "any":
        return True
    if scope == "london":
        return location in {"greater_london", "city_london"}
    return scope == location


def overlap_days(year_start: date, year_end: date, liability_start: date, liability_end: date) -> int:
    start = max(year_start, liability_start)
    end = min(year_end, liability_end)
    if end < start:
        return 0
    return (end - start).days + 1


def find_small_multiplier(rate_year: models.RateYear) -> Decimal:
    for tier in rate_year.multiplier_tiers:
        if tier.code == "small_business":
            return Decimal(tier.rate)
    raise HTTPException(status_code=422, detail=f"No small_business multiplier for {rate_year.label}")


def find_applicable_multiplier(rate_year: models.RateYear, rv: Decimal, is_rhl: bool = False) -> Decimal:
    for tier in rate_year.multiplier_tiers:
        if tier.rhl_only and not is_rhl:
            continue
        if not tier.rhl_only and is_rhl and tier.code in {"small_business", "standard"}:
            continue
        if in_range(rv, tier.min_rv, tier.max_rv, tier.min_inclusive, tier.max_inclusive):
            return Decimal(tier.rate)
    for tier in rate_year.multiplier_tiers:
        if not tier.rhl_only and in_range(rv, tier.min_rv, tier.max_rv, tier.min_inclusive, tier.max_inclusive):
            return Decimal(tier.rate)
    raise HTTPException(status_code=422, detail=f"No multiplier for {rate_year.label}, rv={rv}")


def previous_list_small_multiplier(rate_list: models.RateList) -> Decimal:
    if rate_list.advanced_rule_set:
        value = rate_list.advanced_rule_set.rules_json.get("previous_list_small_multiplier")
        if value:
            return Decimal(str(value))
    return find_small_multiplier(rate_list.years[0])


def find_transition_category(rate_list: models.RateList, request: CalculationRequest) -> str:
    group = location_group(request.location)
    for band in rate_list.transition_bands:
        if band.location_group != group:
            continue
        if in_range(request.current_rv, band.min_rv, band.max_rv, band.min_inclusive, band.max_inclusive):
            return band.category
    raise HTTPException(
        status_code=422,
        detail=f"No transitional band for location={request.location}, rv={request.current_rv}",
    )


def find_transition_cap(rate_year: models.RateYear, category: str) -> models.TransitionCap:
    for cap in rate_year.transition_caps:
        if cap.category == category:
            return cap
    raise HTTPException(status_code=422, detail=f"No {category} transitional cap for {rate_year.label}")


def matching_supplements(rate_year: models.RateYear, request: CalculationRequest) -> list[models.SupplementRule]:
    rules = []
    for rule in rate_year.supplements:
        if not rule.active:
            continue
        if not scope_matches(rule.location_scope, request.location):
            continue
        if in_range(request.current_rv, rule.min_rv, rule.max_rv, rule.min_inclusive, rule.max_inclusive):
            rules.append(rule)
    return rules


def supplement_amounts(rate_year: models.RateYear, request: CalculationRequest, factor: Decimal) -> tuple[list[SupplementBreakdown], dict[str, Decimal]]:
    breakdowns: list[SupplementBreakdown] = []
    grouped: dict[str, Decimal] = {}
    for rule in matching_supplements(rate_year, request):
        unprorated = money(request.current_rv * Decimal(rule.rate))
        amount = money(unprorated * factor)
        breakdowns.append(
            SupplementBreakdown(
                code=rule.code,
                name=rule.name,
                amount=amount,
                unprorated_amount=unprorated,
                rate=Decimal(rule.rate),
                rateable_value=request.current_rv,
            )
        )
        grouped[rule.code] = grouped.get(rule.code, Decimal("0")) + amount
    return breakdowns, grouped


def grouped_unprorated_supplements(rate_year: models.RateYear, request: CalculationRequest) -> dict[str, Decimal]:
    grouped: dict[str, Decimal] = {}
    for rule in matching_supplements(rate_year, request):
        grouped[rule.code] = grouped.get(rule.code, Decimal("0")) + money(request.current_rv * Decimal(rule.rate))
    return grouped


def line(
    code: str,
    label: str,
    unprorated_amount: Decimal,
    factor: Decimal,
    kind: str,
    rateable_value: Decimal | None = None,
    multiplier: Decimal | None = None,
) -> BillLine:
    return BillLine(
        code=code,
        label=label,
        amount=money(unprorated_amount * factor),
        unprorated_amount=money(unprorated_amount),
        rateable_value=rateable_value,
        multiplier=multiplier,
        kind=kind,
    )


def build_lines(
    request: CalculationRequest,
    small_rate: Decimal,
    nca: Decimal,
    transitional_relief: Decimal,
    supplement_unprorated: dict[str, Decimal],
    factor: Decimal,
) -> list[BillLine]:
    standard_supplement = supplement_unprorated.get("standard_supplement", Decimal("0"))
    crossrail = supplement_unprorated.get("crossrail", Decimal("0"))
    city = (
        supplement_unprorated.get("city_premium_small", Decimal("0"))
        + supplement_unprorated.get("city_premium_standard", Decimal("0"))
    )

    lines = [
        line("nca", "National Chargeable Amount", nca, factor, "base", request.current_rv, small_rate),
        line(
            "standard_supplement",
            "Supplement" if standard_supplement else "Supplement not applicable",
            standard_supplement,
            factor,
            "supplement",
            request.current_rv,
            None,
        ),
        line("small_business_rate_relief", "Small Business Rate Relief", Decimal("0"), factor, "relief"),
        line("city_of_london", "City of London Supplement", city, factor, "supplement", request.current_rv, None),
        line("transitional_relief", "Transitional Relief", transitional_relief, factor, "relief"),
        line("crossrail", "Crossrail Supplement", crossrail, factor, "supplement", request.current_rv, None),
    ]
    if request.include_placeholders:
        lines.extend(
            [
                line("charitable_relief", "Charitable Relief", Decimal("0"), factor, "relief"),
                line("rhl_adjustment", "Adjustment for RHL Relief", Decimal("0"), factor, "relief"),
                line(
                    "supporting_small_business_adjustment",
                    "Adjustment for Supporting Small Business Relief",
                    Decimal("0"),
                    factor,
                    "relief",
                ),
            ]
        )
    return lines


def calculate_england_2023(db: Session, rate_list: models.RateList, request: CalculationRequest) -> CalculationResult:
    liability_start = request.liability_start_date or rate_list.start_date
    liability_end = request.liability_end_date or rate_list.end_date
    if liability_start > rate_list.end_date or liability_end < rate_list.start_date:
        raise HTTPException(status_code=422, detail="Liability dates do not overlap the selected rate list")

    category = find_transition_category(rate_list, request)
    previous_base = money(request.previous_rv * find_small_multiplier(rate_list.years[0]))
    annual: list[AnnualCalculation] = []

    for rate_year in rate_list.years:
        small_rate = find_small_multiplier(rate_year)
        nca = money(request.current_rv * small_rate)
        cap = find_transition_cap(rate_year, category)
        transitional_limit = money(previous_base * Decimal(cap.appropriate_fraction))
        transition_applies = nca > previous_base and nca > transitional_limit
        base_charge = transitional_limit if transition_applies else nca
        transitional_relief = money(base_charge - nca) if transition_applies else Decimal("0.00")
        supplement_unprorated = grouped_unprorated_supplements(rate_year, request)
        supplements_total_unprorated = money(sum(supplement_unprorated.values(), Decimal("0")))
        total_before_proration = money(base_charge + supplements_total_unprorated)

        days_in_year = (rate_year.end_date - rate_year.start_date).days + 1
        charged_days = overlap_days(rate_year.start_date, rate_year.end_date, liability_start, liability_end)
        factor = ratio(Decimal(charged_days) / Decimal(days_in_year)) if charged_days else Decimal("0")

        if charged_days:
            supplement_details, _ = supplement_amounts(rate_year, request, factor)
            annual.append(
                AnnualCalculation(
                    year_label=rate_year.label,
                    year_start_date=rate_year.start_date,
                    year_end_date=rate_year.end_date,
                    days_charged=charged_days,
                    days_in_year=days_in_year,
                    proration_factor=factor,
                    transition_category=category,
                    base_liability=previous_base,
                    notional_chargeable_amount=nca,
                    transitional_limit=transitional_limit,
                    transition_applies=transition_applies,
                    transitional_relief=money(transitional_relief * factor),
                    base_charge=money(base_charge * factor),
                    supplements_total=money(supplements_total_unprorated * factor),
                    total_before_proration=total_before_proration,
                    total=money(total_before_proration * factor),
                    lines=build_lines(request, small_rate, nca, transitional_relief, supplement_unprorated, factor),
                    supplements=supplement_details,
                )
            )

        previous_base = base_charge

    return CalculationResult(
        rate_list_code=rate_list.code,
        rate_list_name=rate_list.name,
        calculation_strategy=rate_list.calculation_strategy,
        status=rate_list.status,
        inputs=request,
        annual=annual,
        total=money(sum((year.total for year in annual), Decimal("0"))),
    )


def calculate_england_2026(db: Session, rate_list: models.RateList, request: CalculationRequest) -> CalculationResult:
    liability_start = request.liability_start_date or rate_list.start_date
    liability_end = request.liability_end_date or rate_list.end_date
    if liability_start > rate_list.end_date or liability_end < rate_list.start_date:
        raise HTTPException(status_code=422, detail="Liability dates do not overlap the selected rate list")

    category = find_transition_category(rate_list, request)
    previous_base = money(request.previous_rv * previous_list_small_multiplier(rate_list))
    annual: list[AnnualCalculation] = []

    for rate_year in rate_list.years:
        base_rate = find_applicable_multiplier(rate_year, request.current_rv, request.is_rhl)
        nca = money(request.current_rv * base_rate)
        cap = find_transition_cap(rate_year, category)
        transitional_limit = money(previous_base * Decimal(cap.appropriate_fraction))
        transition_applies = nca > previous_base and nca > transitional_limit
        base_charge = transitional_limit if transition_applies else nca
        transitional_relief = money(base_charge - nca) if transition_applies else Decimal("0.00")
        supplement_unprorated = grouped_unprorated_supplements(rate_year, request)
        supplements_total_unprorated = money(sum(supplement_unprorated.values(), Decimal("0")))
        total_before_proration = money(base_charge + supplements_total_unprorated)

        days_in_year = (rate_year.end_date - rate_year.start_date).days + 1
        charged_days = overlap_days(rate_year.start_date, rate_year.end_date, liability_start, liability_end)
        factor = ratio(Decimal(charged_days) / Decimal(days_in_year)) if charged_days else Decimal("0")

        if charged_days:
            supplement_details, _ = supplement_amounts(rate_year, request, factor)
            annual.append(
                AnnualCalculation(
                    year_label=rate_year.label,
                    year_start_date=rate_year.start_date,
                    year_end_date=rate_year.end_date,
                    days_charged=charged_days,
                    days_in_year=days_in_year,
                    proration_factor=factor,
                    transition_category=category,
                    base_liability=previous_base,
                    notional_chargeable_amount=nca,
                    transitional_limit=transitional_limit,
                    transition_applies=transition_applies,
                    transitional_relief=money(transitional_relief * factor),
                    base_charge=money(base_charge * factor),
                    supplements_total=money(supplements_total_unprorated * factor),
                    total_before_proration=total_before_proration,
                    total=money(total_before_proration * factor),
                    lines=build_lines(request, base_rate, nca, transitional_relief, supplement_unprorated, factor),
                    supplements=supplement_details,
                )
            )

        previous_base = base_charge

    return CalculationResult(
        rate_list_code=rate_list.code,
        rate_list_name=rate_list.name,
        calculation_strategy=rate_list.calculation_strategy,
        status=rate_list.status,
        inputs=request,
        annual=annual,
        total=money(sum((year.total for year in annual), Decimal("0"))),
    )


def calculate(db: Session, request: CalculationRequest) -> CalculationResult:
    rate_list = (
        db.query(models.RateList)
        .filter(models.RateList.code == request.rate_list_code)
        .first()
    )
    if not rate_list:
        raise HTTPException(status_code=404, detail=f"Unknown rate list: {request.rate_list_code}")
    if rate_list.status != "active":
        raise HTTPException(
            status_code=422,
            detail=f"{rate_list.name} is {rate_list.status}; calculation method is not enabled",
        )
    if rate_list.calculation_strategy == "england_2023":
        return calculate_england_2023(db, rate_list, request)
    if rate_list.calculation_strategy == "england_2026":
        return calculate_england_2026(db, rate_list, request)
    raise HTTPException(status_code=422, detail=f"No strategy registered for {rate_list.calculation_strategy}")
