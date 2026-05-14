from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.calculations import in_range, location_group, money, ratio, scope_matches
from app.schemas import (
    AdvancedAnnualComparison,
    AdvancedCalculationRequest,
    AdvancedCalculationResult,
    AdvancedScenarioSide,
    AnnualCalculation,
    BillLine,
    SupplementBreakdown,
    ValidationIssue,
)


@dataclass
class EventState:
    from_date: date
    rv: Decimal
    payable_percent: Decimal
    vacant: bool


def rule_decimal(rules: dict, path: list[str], default: str) -> Decimal:
    value = rules
    for key in path:
        if not isinstance(value, dict) or key not in value:
            return Decimal(default)
        value = value[key]
    return Decimal(str(value))


def rules_for(rate_list: models.RateList) -> dict:
    return rate_list.advanced_rule_set.rules_json if rate_list.advanced_rule_set else {}


def issue(field: str, message: str, severity: str = "error") -> ValidationIssue:
    return ValidationIssue(severity=severity, field=field, message=message)


def find_rate_list(db: Session, code: str) -> models.RateList:
    rate_list = db.query(models.RateList).filter(models.RateList.code == code).first()
    if not rate_list:
        raise HTTPException(status_code=404, detail=f"Unknown rate list: {code}")
    if rate_list.status != "active":
        raise HTTPException(status_code=422, detail=f"{rate_list.name} is {rate_list.status}")
    return rate_list


def find_transition_category_for_rv(rate_list: models.RateList, location: str, rv: Decimal) -> str:
    group = location_group(location)
    for band in rate_list.transition_bands:
        if band.location_group != group:
            continue
        if in_range(rv, band.min_rv, band.max_rv, band.min_inclusive, band.max_inclusive):
            return band.category
    raise HTTPException(status_code=422, detail=f"No transitional band for location={location}, rv={rv}")


def find_transition_cap(rate_year: models.RateYear, category: str) -> models.TransitionCap:
    for cap in rate_year.transition_caps:
        if cap.category == category:
            return cap
    raise HTTPException(status_code=422, detail=f"No {category} transitional cap for {rate_year.label}")


def previous_list_multiplier(rate_list: models.RateList) -> Decimal:
    rules = rules_for(rate_list)
    return rule_decimal(rules, ["previous_list_small_multiplier"], "0.499")


def charity_percent(rate_list: models.RateList) -> Decimal:
    return rule_decimal(rules_for(rate_list), ["charity_payable_percent"], "0.20")


def find_small_multiplier(rate_year: models.RateYear) -> Decimal:
    for tier in rate_year.multiplier_tiers:
        if tier.code == "small_business":
            return Decimal(tier.rate)
    raise HTTPException(status_code=422, detail=f"No small_business multiplier for {rate_year.label}")


def applicable_multiplier(rate_list: models.RateList, rate_year: models.RateYear, rv: Decimal, is_rhl: bool) -> tuple[Decimal, str]:
    mode = rules_for(rate_list).get("base_multiplier_mode", "small_plus_supplements")
    if mode == "small_plus_supplements":
        return find_small_multiplier(rate_year), "small_business"

    for tier in rate_year.multiplier_tiers:
        if tier.rhl_only and not is_rhl:
            continue
        if not tier.rhl_only and is_rhl and tier.code in {"small_business", "standard"}:
            continue
        if in_range(rv, tier.min_rv, tier.max_rv, tier.min_inclusive, tier.max_inclusive):
            return Decimal(tier.rate), tier.code

    for tier in rate_year.multiplier_tiers:
        if not tier.rhl_only and in_range(rv, tier.min_rv, tier.max_rv, tier.min_inclusive, tier.max_inclusive):
            return Decimal(tier.rate), tier.code
    raise HTTPException(status_code=422, detail=f"No multiplier for {rate_year.label}, rv={rv}")


def matching_supplements(rate_year: models.RateYear, location: str, rv: Decimal) -> list[models.SupplementRule]:
    rules = []
    for rule in rate_year.supplements:
        if not rule.active:
            continue
        if not scope_matches(rule.location_scope, location):
            continue
        if in_range(rv, rule.min_rv, rule.max_rv, rule.min_inclusive, rule.max_inclusive):
            rules.append(rule)
    return rules


def sbrr_percent(rate_list: models.RateList, rv: Decimal) -> Decimal:
    rules = rules_for(rate_list)
    full_max = rule_decimal(rules, ["sbrr", "full_relief_max_rv"], "12000")
    taper_max = rule_decimal(rules, ["sbrr", "taper_max_rv"], "15000")
    if rv <= full_max:
        return Decimal("1")
    if rv < taper_max:
        return ratio((taper_max - rv) / (taper_max - full_max))
    return Decimal("0")


def retail_relief_percent(rate_list: models.RateList, year_label: str) -> Decimal:
    value = rules_for(rate_list).get("retail_relief_by_year", {}).get(year_label, "0")
    return Decimal(str(value))


def side_percent(rate_list: models.RateList, side: AdvancedScenarioSide, value: Decimal | None = None) -> Decimal:
    if side.charity:
        return charity_percent(rate_list)
    return Decimal(value if value is not None else side.payable_percent)


def validate_certificate(side: AdvancedScenarioSide, side_name: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    cert = side.certificate
    if cert.start_value is not None and not cert.start_date:
        issues.append(issue(f"{side_name}.certificate.start_date", "Certificate value entered but no start certificate date"))
    if cert.start_date and cert.start_value is None:
        issues.append(issue(f"{side_name}.certificate.start_value", "Certificate start date entered but no certificate value"))
    if cert.prior_value is not None and not cert.prior_date:
        issues.append(issue(f"{side_name}.certificate.prior_date", "Prior-list certificate value entered but no certificate date"))
    if cert.prior_date and cert.prior_value is None:
        issues.append(issue(f"{side_name}.certificate.prior_value", "Prior-list certificate date entered but no certificate value"))
    return issues


def validate_improvements(
    rate_list: models.RateList,
    side: AdvancedScenarioSide,
    side_name: str,
    change_dates: set[date],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for index, relief in enumerate(side.improvement_reliefs):
        if not relief.from_date and not relief.to_date and relief.certified_value is None:
            continue
        prefix = f"{side_name}.improvement_reliefs.{index}"
        if not relief.from_date or not relief.to_date or relief.certified_value is None:
            issues.append(issue(prefix, "Improvement relief rows need from date, to date, and certified value"))
            continue
        if relief.from_date not in change_dates:
            issues.append(issue(f"{prefix}.from_date", "Improvement relief start date must also exist in the Date Section"))
        day_after = relief.to_date + timedelta(days=1)
        if relief.to_date < rate_list.end_date and day_after not in change_dates:
            issues.append(issue(f"{prefix}.to_date", "The day after the improvement relief end date must exist in the Date Section"))
    return issues


def normalize_side(
    rate_list: models.RateList,
    side: AdvancedScenarioSide,
    side_name: str,
    allow_dates_any_order: bool,
) -> tuple[list[EventState], list[ValidationIssue]]:
    issues: list[ValidationIssue] = []
    issues.extend(validate_certificate(side, side_name))

    entered_dates: list[date] = []
    events: list[tuple[int, EventState]] = [
        (
            0,
            EventState(
                from_date=rate_list.start_date,
                rv=side.start_rv,
                payable_percent=side_percent(rate_list, side),
                vacant=side.vacant,
            ),
        )
    ]

    for index, change in enumerate(side.changes, start=1):
        if not change.from_date and change.rv is None and change.payable_percent is None:
            continue
        prefix = f"{side_name}.changes.{index - 1}"
        if not change.from_date:
            issues.append(issue(f"{prefix}.from_date", "Date change row needs a from date"))
            continue
        if change.rv is None:
            issues.append(issue(f"{prefix}.rv", "Date change row needs an RV"))
            continue
        if change.from_date < rate_list.start_date or change.from_date > rate_list.end_date:
            issues.append(issue(f"{prefix}.from_date", "Date must be inside the selected rating list"))
        entered_dates.append(change.from_date)
        events.append(
            (
                index,
                EventState(
                    from_date=change.from_date,
                    rv=change.rv,
                    payable_percent=side_percent(rate_list, side, change.payable_percent),
                    vacant=change.vacant,
                ),
            )
        )

    cert = side.certificate
    if cert.start_value is not None and cert.start_date:
        if cert.start_date < rate_list.start_date or cert.start_date > rate_list.end_date:
            issues.append(issue(f"{side_name}.certificate.start_date", "Certificate effective date must be inside the selected rating list"))
        if cert.start_date not in {item.from_date for _, item in events}:
            issues.append(issue(f"{side_name}.certificate.start_date", "Certificate effective date must exist in the Date Section", "warning"))
        events.append(
            (
                1000,
                EventState(
                    from_date=cert.start_date,
                    rv=cert.start_value,
                    payable_percent=side_percent(rate_list, side),
                    vacant=side.vacant,
                ),
            )
        )

    if not allow_dates_any_order and entered_dates != sorted(entered_dates):
        issues.append(issue(f"{side_name}.changes", "Dates are out of sequence"))

    deduped: dict[date, tuple[int, EventState]] = {}
    for order, event in events:
        if event.from_date in deduped:
            issues.append(issue(f"{side_name}.changes", f"Duplicate date {event.from_date} was collapsed to the last entered value", "warning"))
        deduped[event.from_date] = (order, event)

    change_dates = set(deduped)
    issues.extend(validate_improvements(rate_list, side, side_name, change_dates))
    return [item[1] for item in sorted(deduped.values(), key=lambda pair: (pair[1].from_date, pair[0]))], issues


def state_at(events: list[EventState], when: date) -> EventState:
    state = events[0]
    for event in events:
        if event.from_date <= when:
            state = event
        else:
            break
    return state


def active_improvement_value(side: AdvancedScenarioSide, when: date) -> Decimal:
    total = Decimal("0")
    for relief in side.improvement_reliefs:
        if relief.from_date and relief.to_date and relief.certified_value is not None:
            if relief.from_date <= when <= relief.to_date:
                total += relief.certified_value
    return total


def segment_ranges(rate_year: models.RateYear, events: list[EventState], side: AdvancedScenarioSide) -> list[tuple[date, date]]:
    boundaries = {rate_year.start_date, rate_year.end_date + timedelta(days=1)}
    for event in events:
        if rate_year.start_date < event.from_date <= rate_year.end_date:
            boundaries.add(event.from_date)
    for relief in side.improvement_reliefs:
        if relief.from_date and rate_year.start_date < relief.from_date <= rate_year.end_date:
            boundaries.add(relief.from_date)
        if relief.to_date:
            after = relief.to_date + timedelta(days=1)
            if rate_year.start_date < after <= rate_year.end_date:
                boundaries.add(after)
    ordered = sorted(boundaries)
    return [(ordered[index], ordered[index + 1] - timedelta(days=1)) for index in range(len(ordered) - 1)]


def aggregate_lines(lines: dict[str, BillLine], next_line: BillLine):
    current = lines.get(next_line.code)
    if not current:
        lines[next_line.code] = next_line
        return
    current.amount = money(current.amount + next_line.amount)
    current.unprorated_amount = money(current.unprorated_amount + next_line.unprorated_amount)


def build_line(
    code: str,
    label: str,
    unprorated: Decimal,
    factor: Decimal,
    kind: str,
    rv: Decimal | None = None,
    multiplier: Decimal | None = None,
) -> BillLine:
    return BillLine(
        code=code,
        label=label,
        amount=money(unprorated * factor),
        unprorated_amount=money(unprorated),
        rateable_value=rv,
        multiplier=multiplier,
        kind=kind,
    )


def calculate_side(
    rate_list: models.RateList,
    request: AdvancedCalculationRequest,
    side: AdvancedScenarioSide,
    events: list[EventState],
    side_name: str,
) -> list[AnnualCalculation]:
    prior_rv = side.certificate.prior_value if side.certificate.prior_value is not None else side.prior_rv
    if side.base_liability_override is not None:
        previous_base = money(side.base_liability_override)
    elif side.ssbr_current and side.ssbr_prior_liability is not None:
        previous_base = money(side.ssbr_prior_liability)
    else:
        previous_base = money(prior_rv * previous_list_multiplier(rate_list) * side_percent(rate_list, side))
    if side.vacant:
        previous_base = Decimal("0.00")

    annual: list[AnnualCalculation] = []
    for year_index, rate_year in enumerate(rate_list.years):
        days_in_year = (rate_year.end_date - rate_year.start_date).days + 1
        start_state = state_at(events, rate_year.start_date)
        start_rv = max(Decimal("0"), start_state.rv - active_improvement_value(side, rate_year.start_date))
        base_multiplier, multiplier_code = applicable_multiplier(rate_list, rate_year, start_rv, side.is_rhl)
        start_percent = Decimal("0") if start_state.vacant else start_state.payable_percent
        nca = money(start_rv * base_multiplier * start_percent)
        category = find_transition_category_for_rv(rate_list, request.location, start_rv)
        cap = find_transition_cap(rate_year, category)
        transitional_limit = money(previous_base * Decimal(cap.appropriate_fraction))
        ssbr_limit = None
        if side.ssbr_current:
            cap_amount = rule_decimal(rules_for(rate_list), ["ssbr", "annual_cap_amount"], "800")
            ssbr_limit = max(transitional_limit, money(previous_base + cap_amount))
            transitional_limit = money(ssbr_limit)

        transition_applies = nca > previous_base and nca > transitional_limit and prior_rv > 0
        annual_base_charge = transitional_limit if transition_applies else nca
        transitional_relief = money(annual_base_charge - nca) if transition_applies else Decimal("0.00")

        total = Decimal("0.00")
        supplements_total = Decimal("0.00")
        base_charge_total = Decimal("0.00")
        line_map: dict[str, BillLine] = {}
        supplement_details: dict[str, SupplementBreakdown] = {}

        for start, end in segment_ranges(rate_year, events, side):
            segment_days = (end - start).days + 1
            factor = ratio(Decimal(segment_days) / Decimal(days_in_year))
            state = state_at(events, start)
            improvement = active_improvement_value(side, start)
            rv = max(Decimal("0"), state.rv - improvement)
            percent = Decimal("0") if state.vacant else state.payable_percent
            multiplier, segment_multiplier_code = applicable_multiplier(rate_list, rate_year, rv, side.is_rhl)
            segment_nca = money(rv * multiplier * percent)
            segment_tl = money(previous_base * Decimal(cap.appropriate_fraction))
            if side.ssbr_current:
                segment_tl = money(max(segment_tl, money(previous_base + rule_decimal(rules_for(rate_list), ["ssbr", "annual_cap_amount"], "800"))))
            segment_transition = segment_nca > previous_base and segment_nca > segment_tl and prior_rv > 0
            segment_base = segment_tl if segment_transition else segment_nca

            aggregate_lines(
                line_map,
                build_line("nca", "National Chargeable Amount", segment_nca, factor, "base", rv, multiplier),
            )
            if segment_multiplier_code != "small_business":
                aggregate_lines(
                    line_map,
                    build_line("multiplier", f"Multiplier: {segment_multiplier_code}", segment_nca, factor, "base", rv, multiplier),
                )
            if segment_transition:
                aggregate_lines(
                    line_map,
                    build_line("transitional_relief", "Transitional Relief", money(segment_base - segment_nca), factor, "relief"),
                )

            segment_supplements = Decimal("0.00")
            for rule in matching_supplements(rate_year, request.location, rv):
                raw = money(rv * Decimal(rule.rate) * percent)
                segment_supplements += raw
                detail = supplement_details.get(rule.code)
                amount = money(raw * factor)
                if detail:
                    detail.amount = money(detail.amount + amount)
                    detail.unprorated_amount = money(detail.unprorated_amount + raw)
                else:
                    supplement_details[rule.code] = SupplementBreakdown(
                        code=rule.code,
                        name=rule.name,
                        amount=amount,
                        unprorated_amount=money(raw),
                        rate=Decimal(rule.rate),
                        rateable_value=rv,
                    )
                aggregate_lines(line_map, build_line(rule.code, rule.name, raw, factor, "supplement", rv, Decimal(rule.rate)))

            relief_total = Decimal("0.00")
            if year_index < len(side.sbrr_by_year) and side.sbrr_by_year[year_index] and not side.charity and not state.vacant:
                relief = money(segment_base * sbrr_percent(rate_list, rv))
                relief_total -= relief
                aggregate_lines(
                    line_map,
                    build_line("small_business_rate_relief", "Small Business Rate Relief", -relief, factor, "relief"),
                )

            retail_percent = retail_relief_percent(rate_list, rate_year.label) if side.retail_relief and not state.vacant else Decimal("0")
            if retail_percent:
                relief = money(segment_base * retail_percent)
                relief_total -= relief
                aggregate_lines(line_map, build_line("retail_relief", "Retail/RHL Relief", -relief, factor, "relief"))

            if side.ssbr_current:
                aggregate_lines(line_map, build_line("supporting_small_business_relief", "Supporting Small Business Relief", Decimal("0"), factor, "relief"))

            if improvement:
                aggregate_lines(line_map, build_line("improvement_relief", "Improvement Relief RV Deduction", Decimal("0"), factor, "relief", improvement))

            segment_total = money(segment_base + segment_supplements + relief_total)
            total += money(segment_total * factor)
            base_charge_total += money(segment_base * factor)
            supplements_total += money(segment_supplements * factor)

        if request.include_placeholders:
            for code, label in [
                ("charitable_relief", "Charitable Relief"),
                ("rhl_adjustment", "Adjustment for RHL Relief"),
                ("supporting_small_business_adjustment", "Adjustment for Supporting Small Business Relief"),
            ]:
                if code not in line_map:
                    line_map[code] = build_line(code, label, Decimal("0"), Decimal("0"), "relief")

        annual.append(
            AnnualCalculation(
                year_label=rate_year.label,
                year_start_date=rate_year.start_date,
                year_end_date=rate_year.end_date,
                days_charged=days_in_year,
                days_in_year=days_in_year,
                proration_factor=Decimal("1.000000"),
                transition_category=category,
                base_liability=previous_base,
                notional_chargeable_amount=nca,
                transitional_limit=transitional_limit,
                transition_applies=transition_applies,
                transitional_relief=transitional_relief,
                base_charge=money(base_charge_total),
                supplements_total=money(supplements_total),
                total_before_proration=money(base_charge_total + supplements_total),
                total=money(total),
                lines=list(line_map.values()),
                supplements=list(supplement_details.values()),
            )
        )
        previous_base = annual_base_charge
        prior_rv = start_rv

    return annual


def calculate_advanced(db: Session, request: AdvancedCalculationRequest) -> AdvancedCalculationResult:
    rate_list = find_rate_list(db, request.rate_list_code)
    original_events, original_issues = normalize_side(rate_list, request.original, "original", request.allow_dates_any_order)
    revised_events, revised_issues = normalize_side(rate_list, request.revised, "revised", request.allow_dates_any_order)
    issues = original_issues + revised_issues

    if request.original.charity and any(request.original.sbrr_by_year):
        issues.append(issue("original.charity", "Charity and SBRR cannot both be selected"))
    if request.revised.charity and any(request.revised.sbrr_by_year):
        issues.append(issue("revised.charity", "Charity and SBRR cannot both be selected"))
    if request.original.ssbr_current and request.original.ssbr_prior_liability is None and request.original.base_liability_override is None:
        issues.append(issue("original.ssbr_prior_liability", "SSBR needs a prior liability or base-liability override"))
    if request.revised.ssbr_current and request.revised.ssbr_prior_liability is None and request.revised.base_liability_override is None:
        issues.append(issue("revised.ssbr_prior_liability", "SSBR needs a prior liability or base-liability override"))

    if any(item.severity == "error" for item in issues):
        return AdvancedCalculationResult(
            rate_list_code=rate_list.code,
            rate_list_name=rate_list.name,
            calculation_strategy=rate_list.calculation_strategy,
            status=rate_list.status,
            inputs=request,
            original=[],
            revised=[],
            comparison=[],
            total_original=Decimal("0.00"),
            total_revised=Decimal("0.00"),
            total_saving=Decimal("0.00"),
            issues=issues,
        )

    original = calculate_side(rate_list, request, request.original, original_events, "original")
    revised = calculate_side(rate_list, request, request.revised, revised_events, "revised")
    comparison: list[AdvancedAnnualComparison] = []
    for original_year, revised_year in zip(original, revised, strict=False):
        comparison.append(
            AdvancedAnnualComparison(
                year_label=original_year.year_label,
                year_start_date=original_year.year_start_date,
                year_end_date=original_year.year_end_date,
                original_total=original_year.total,
                revised_total=revised_year.total,
                saving=money(original_year.total - revised_year.total),
                original_phased=original_year.transition_applies,
                revised_phased=revised_year.transition_applies,
            )
        )

    total_original = money(sum((year.total for year in original), Decimal("0")))
    total_revised = money(sum((year.total for year in revised), Decimal("0")))
    return AdvancedCalculationResult(
        rate_list_code=rate_list.code,
        rate_list_name=rate_list.name,
        calculation_strategy=rate_list.calculation_strategy,
        status=rate_list.status,
        inputs=request,
        original=original,
        revised=revised,
        comparison=comparison,
        total_original=total_original,
        total_revised=total_revised,
        total_saving=money(total_original - total_revised),
        issues=issues,
    )
