from copy import deepcopy
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app import models


GOV_MULTIPLIERS = "https://www.gov.uk/calculate-your-business-rates/"
GOV_TRANSITIONAL = "https://www.gov.uk/business-rates-relief/transitional-relief"
GOV_2026_MULTIPLIERS = (
    "https://www.gov.uk/government/publications/22026-notification-of-non-domestic-rating-multipliers-for-202627/"
    "22026-notification-of-non-domestic-rating-multipliers-for-202627"
)
LONDON_CROSSRAIL = (
    "https://www.london.gov.uk/programmes-strategies/transport/rail-and-underground/"
    "elizabeth-line/paying-crossrail-business-rate-supplement"
)
CITY_OF_LONDON = "https://www.cityoflondon.gov.uk/services/business-rates/how-your-bill-is-calculated"


def d(value: str) -> Decimal:
    return Decimal(value)


def add_rate_year(
    rate_list: models.RateList,
    label: str,
    start: date,
    end: date,
    order: int,
    small_rate: str,
    standard_rate: str,
    supplement_rate: str,
    caps: dict[str, str],
    city_small: str,
    city_standard: str,
):
    year = models.RateYear(
        label=label,
        start_date=start,
        end_date=end,
        display_order=order,
        inflation_factor=d("1"),
        source_url=GOV_MULTIPLIERS,
        source_note="Government multiplier table; transcript calculation treats the small multiplier as the base NCA rate.",
    )
    year.multiplier_tiers = [
        models.MultiplierTier(
            code="small_business",
            name="Small business multiplier",
            min_rv=d("0"),
            max_rv=d("51000"),
            max_inclusive=False,
            rate=d(small_rate),
        ),
        models.MultiplierTier(
            code="standard",
            name="Standard multiplier",
            min_rv=d("51000"),
            min_inclusive=True,
            rate=d(standard_rate),
        ),
    ]
    for category, fraction in caps.items():
        cap_percent = (d(fraction) - d("1")) * d("100")
        year.transition_caps.append(
            models.TransitionCap(
                category=category,
                cap_percent=cap_percent,
                inflation_factor=d("1"),
                appropriate_fraction=d(fraction),
            )
        )
    year.supplements = [
        models.SupplementRule(
            code="standard_supplement",
            name="Supplement",
            location_scope="any",
            min_rv=d("51000"),
            min_inclusive=True,
            rate=d(supplement_rate),
            source_url=GOV_MULTIPLIERS,
            source_note="Difference between standard and small multipliers, shown as a supplement in CalcuRate.",
        ),
        models.SupplementRule(
            code="crossrail",
            name="Crossrail Supplement",
            location_scope="london",
            min_rv=d("75000"),
            min_inclusive=False,
            rate=d("0.020"),
            source_url=LONDON_CROSSRAIL,
            source_note="Applies in Greater London and City of London above the 2023-list threshold.",
        ),
        models.SupplementRule(
            code="city_premium_small",
            name="City of London Supplement",
            location_scope="city_london",
            min_rv=d("0"),
            max_rv=d("51000"),
            max_inclusive=False,
            rate=d(city_small),
            source_note="Seeded from supplied CalcuRate spreadsheet screenshot.",
        ),
        models.SupplementRule(
            code="city_premium_standard",
            name="City of London Supplement",
            location_scope="city_london",
            min_rv=d("51000"),
            min_inclusive=True,
            rate=d(city_standard),
            source_note="Seeded from supplied CalcuRate spreadsheet screenshot.",
        ),
    ]
    rate_list.years.append(year)


def add_transition_bands(rate_list: models.RateList):
    rate_list.transition_bands = [
        models.TransitionBand(
            location_group="england",
            category="small",
            min_rv=d("0"),
            max_rv=d("20000"),
            max_inclusive=True,
        ),
        models.TransitionBand(
            location_group="england",
            category="medium",
            min_rv=d("20000"),
            min_inclusive=False,
            max_rv=d("100000"),
            max_inclusive=True,
        ),
        models.TransitionBand(
            location_group="england",
            category="large",
            min_rv=d("100000"),
            min_inclusive=False,
        ),
        models.TransitionBand(
            location_group="london",
            category="small",
            min_rv=d("0"),
            max_rv=d("28000"),
            max_inclusive=True,
        ),
        models.TransitionBand(
            location_group="london",
            category="medium",
            min_rv=d("28000"),
            min_inclusive=False,
            max_rv=d("100000"),
            max_inclusive=True,
        ),
        models.TransitionBand(
            location_group="london",
            category="large",
            min_rv=d("100000"),
            min_inclusive=False,
        ),
    ]


def england_2023_advanced_rules() -> dict:
    return {
        "base_multiplier_mode": "small_plus_supplements",
        "previous_list_small_multiplier": "0.499",
        "charity_payable_percent": "0.20",
        "sbrr": {
            "full_relief_max_rv": "12000",
            "taper_max_rv": "15000",
        },
        "retail_relief_by_year": {
            "2023/24": "0.75",
            "2024/25": "0.75",
            "2025/26": "0.40",
        },
        "ssbr": {
            "enabled": True,
            "annual_cap_amount": "600",
        },
    }


def england_2026_advanced_rules() -> dict:
    return {
        "base_multiplier_mode": "applicable_multiplier",
        "previous_list_small_multiplier": "0.499",
        "previous_list_multiplier_tiers": [
            {
                "code": "small_business",
                "name": "2025/26 small business multiplier",
                "min_rv": "0",
                "max_rv": "51000",
                "max_inclusive": False,
                "rate": "0.499",
            },
            {
                "code": "standard",
                "name": "2025/26 standard multiplier",
                "min_rv": "51000",
                "min_inclusive": True,
                "rate": "0.555",
            },
        ],
        "charity_payable_percent": "0.20",
        "sbrr": {
            "full_relief_max_rv": "12000",
            "taper_max_rv": "15000",
        },
        "retail_relief_by_year": {},
        "ssbr": {
            "enabled": True,
            "annual_cap_amount": "800",
        },
        "supplement_conditions": {
            "transitional_supplement": {
                "exclude_when_any": ["transition_applies", "ssbr_applies", "new_entry"],
            },
        },
    }


def england_2023() -> models.RateList:
    rate_list = models.RateList(
        code="england_2023",
        name="England 2023 Rating List",
        country="England",
        status="active",
        calculation_strategy="england_2023",
        start_date=date(2023, 4, 1),
        end_date=date(2026, 3, 31),
        source_url=f"{GOV_MULTIPLIERS}\n{GOV_TRANSITIONAL}\n{LONDON_CROSSRAIL}",
        source_note="Active v1 method based on the supplied transcript and screenshots.",
        verified_on=date(2026, 5, 13),
    )
    rate_list.advanced_rule_set = models.AdvancedRuleSet(rules_json=england_2023_advanced_rules())
    add_transition_bands(rate_list)
    add_rate_year(
        rate_list,
        "2023/24",
        date(2023, 4, 1),
        date(2024, 3, 31),
        1,
        "0.499",
        "0.512",
        "0.013",
        {"small": "1.05", "medium": "1.15", "large": "1.30"},
        "0.014",
        "0.014",
    )
    add_rate_year(
        rate_list,
        "2024/25",
        date(2024, 4, 1),
        date(2025, 3, 31),
        2,
        "0.499",
        "0.546",
        "0.047",
        {"small": "1.10", "medium": "1.25", "large": "1.40"},
        "0.016",
        "0.018",
    )
    add_rate_year(
        rate_list,
        "2025/26",
        date(2025, 4, 1),
        date(2026, 3, 31),
        3,
        "0.499",
        "0.555",
        "0.056",
        {"small": "1.25", "medium": "1.40", "large": "1.55"},
        "0.020",
        "0.022",
    )
    return rate_list


def england_2026_draft() -> models.RateList:
    rate_list = models.RateList(
        code="england_2026_draft",
        name="England 2026 Rating List",
        country="England",
        status="active",
        calculation_strategy="england_2026",
        start_date=date(2026, 4, 1),
        end_date=date(2029, 3, 31),
        source_url=f"{GOV_2026_MULTIPLIERS}\n{GOV_TRANSITIONAL}\n{LONDON_CROSSRAIL}\n{CITY_OF_LONDON}",
        source_note="Active 2026-list method seeded from England8_wo.xlsm; 2027/28 and 2028/29 use workbook estimates.",
        verified_on=date(2026, 6, 16),
    )
    rate_list.advanced_rule_set = models.AdvancedRuleSet(rules_json=england_2026_advanced_rules())
    add_transition_bands(rate_list)
    year = models.RateYear(
        label="2026/27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        display_order=1,
        inflation_factor=d("1"),
        source_url=GOV_2026_MULTIPLIERS,
        source_note="Official 2026/27 five-multiplier notification.",
    )
    year.multiplier_tiers = [
        models.MultiplierTier(code="small_rhl", name="Small RHL multiplier", min_rv=d("0"), max_rv=d("51000"), max_inclusive=False, rhl_only=True, rate=d("0.382")),
        models.MultiplierTier(code="small_business", name="Small business multiplier", min_rv=d("0"), max_rv=d("51000"), max_inclusive=False, rate=d("0.432")),
        models.MultiplierTier(code="standard_rhl", name="Standard RHL multiplier", min_rv=d("51000"), max_rv=d("500000"), max_inclusive=False, rhl_only=True, rate=d("0.430")),
        models.MultiplierTier(code="standard", name="Standard multiplier", min_rv=d("51000"), max_rv=d("500000"), max_inclusive=False, rate=d("0.480")),
        models.MultiplierTier(code="high_value", name="High-value multiplier", min_rv=d("500000"), min_inclusive=True, rate=d("0.508")),
    ]
    for category, fraction in {"small": "1.05", "medium": "1.15", "large": "1.30"}.items():
        year.transition_caps.append(
            models.TransitionCap(
                category=category,
                cap_percent=(d(fraction) - d("1")) * d("100"),
                inflation_factor=d("1"),
                appropriate_fraction=d(fraction),
            )
        )
    year.supplements = [
        models.SupplementRule(
            code="transitional_supplement",
            name="Transitional Relief Supplement",
            location_scope="any",
            rate=d("0.010"),
            source_url=GOV_2026_MULTIPLIERS,
            source_note="One-year 2026/27 supplement; stored for reference while 2026 method is draft.",
        ),
        models.SupplementRule(
            code="crossrail",
            name="Crossrail Supplement",
            location_scope="london",
            min_rv=d("92000"),
            min_inclusive=False,
            rate=d("0.020"),
            source_url=LONDON_CROSSRAIL,
            source_note="2026-list threshold.",
        ),
        models.SupplementRule(
            code="city_premium_small",
            name="City of London Premium",
            location_scope="city_london",
            max_rv=d("51000"),
            max_inclusive=False,
            rate=d("0.029"),
            source_url=CITY_OF_LONDON,
        ),
        models.SupplementRule(
            code="city_premium_standard",
            name="City of London Premium",
            location_scope="city_london",
            min_rv=d("51000"),
            min_inclusive=True,
            rate=d("0.032"),
            source_url=CITY_OF_LONDON,
        ),
    ]
    years = [year]
    for label, start, end, order, small, standard, high, small_rhl, standard_rhl, caps in [
        (
            "2027/28",
            date(2027, 4, 1),
            date(2028, 3, 31),
            2,
            "0.450",
            "0.500",
            "0.529",
            "0.398",
            "0.448",
            {"small": "1.1462", "medium": "1.3025", "large": "1.3025"},
        ),
        (
            "2028/29",
            date(2028, 4, 1),
            date(2029, 3, 31),
            3,
            "0.469",
            "0.521",
            "0.551",
            "0.415",
            "0.467",
            {"small": "1.3025", "medium": "1.4588", "large": "1.3025"},
        ),
    ]:
        estimated_year = models.RateYear(
            label=label,
            start_date=start,
            end_date=end,
            display_order=order,
            inflation_factor=d("1"),
            source_url=GOV_2026_MULTIPLIERS,
            source_note="Estimated from England8_wo.xlsm update/data tables.",
        )
        estimated_year.multiplier_tiers = [
            models.MultiplierTier(code="small_rhl", name="Small RHL multiplier", min_rv=d("0"), max_rv=d("51000"), max_inclusive=False, rhl_only=True, rate=d(small_rhl)),
            models.MultiplierTier(code="small_business", name="Small business multiplier", min_rv=d("0"), max_rv=d("51000"), max_inclusive=False, rate=d(small)),
            models.MultiplierTier(code="standard_rhl", name="Standard RHL multiplier", min_rv=d("51000"), max_rv=d("500000"), max_inclusive=False, rhl_only=True, rate=d(standard_rhl)),
            models.MultiplierTier(code="standard", name="Standard multiplier", min_rv=d("51000"), max_rv=d("500000"), max_inclusive=False, rate=d(standard)),
            models.MultiplierTier(code="high_value", name="High-value multiplier", min_rv=d("500000"), min_inclusive=True, rate=d(high)),
        ]
        for category, fraction in caps.items():
            estimated_year.transition_caps.append(
                models.TransitionCap(
                    category=category,
                    cap_percent=(d(fraction) - d("1")) * d("100"),
                    inflation_factor=d("1"),
                    appropriate_fraction=d(fraction),
                )
            )
        estimated_year.supplements = [
            models.SupplementRule(
                code="crossrail",
                name="Crossrail Supplement",
                location_scope="london",
                min_rv=d("92000"),
                min_inclusive=False,
                rate=d("0.020"),
                source_url=LONDON_CROSSRAIL,
                source_note="England8 2026-list threshold.",
            ),
            models.SupplementRule(
                code="city_premium_small",
                name="City of London Premium",
                location_scope="city_london",
                max_rv=d("51000"),
                max_inclusive=False,
                rate=d("0.029"),
                source_url=CITY_OF_LONDON,
            ),
            models.SupplementRule(
                code="city_premium_standard",
                name="City of London Premium",
                location_scope="city_london",
                min_rv=d("51000"),
                min_inclusive=True,
                rate=d("0.032"),
                source_url=CITY_OF_LONDON,
            ),
        ]
        years.append(estimated_year)
    rate_list.years = years
    return rate_list


def merge_missing_rules(current: dict | None, defaults: dict) -> tuple[dict, bool]:
    current = dict(current or {})
    changed = False
    for key, value in defaults.items():
        if key not in current:
            current[key] = value
            changed = True
        elif isinstance(current[key], dict) and isinstance(value, dict):
            merged, nested_changed = merge_missing_rules(current[key], value)
            if nested_changed:
                current[key] = merged
                changed = True
    return current, changed


def clone_multiplier_tier(tier: models.MultiplierTier) -> models.MultiplierTier:
    return models.MultiplierTier(
        code=tier.code,
        name=tier.name,
        min_rv=tier.min_rv,
        max_rv=tier.max_rv,
        min_inclusive=tier.min_inclusive,
        max_inclusive=tier.max_inclusive,
        rhl_only=tier.rhl_only,
        rate=tier.rate,
    )


def clone_transition_cap(cap: models.TransitionCap) -> models.TransitionCap:
    return models.TransitionCap(
        category=cap.category,
        cap_percent=cap.cap_percent,
        inflation_factor=cap.inflation_factor,
        appropriate_fraction=cap.appropriate_fraction,
    )


def clone_supplement_rule(rule: models.SupplementRule) -> models.SupplementRule:
    return models.SupplementRule(
        code=rule.code,
        name=rule.name,
        location_scope=rule.location_scope,
        min_rv=rule.min_rv,
        max_rv=rule.max_rv,
        min_inclusive=rule.min_inclusive,
        max_inclusive=rule.max_inclusive,
        rate=rule.rate,
        active=rule.active,
        source_url=rule.source_url,
        source_note=rule.source_note,
    )


def clone_rate_year(year: models.RateYear) -> models.RateYear:
    clone = models.RateYear(
        label=year.label,
        start_date=year.start_date,
        end_date=year.end_date,
        display_order=year.display_order,
        inflation_factor=year.inflation_factor,
        source_url=year.source_url,
        source_note=year.source_note,
    )
    clone.multiplier_tiers = [clone_multiplier_tier(tier) for tier in year.multiplier_tiers]
    clone.transition_caps = [clone_transition_cap(cap) for cap in year.transition_caps]
    clone.supplements = [clone_supplement_rule(rule) for rule in year.supplements]
    return clone


def clone_transition_band(band: models.TransitionBand) -> models.TransitionBand:
    return models.TransitionBand(
        location_group=band.location_group,
        category=band.category,
        min_rv=band.min_rv,
        max_rv=band.max_rv,
        min_inclusive=band.min_inclusive,
        max_inclusive=band.max_inclusive,
    )


def sync_2026_rate_list(rate_list: models.RateList) -> bool:
    default = england_2026_draft()
    changed = False

    for field in [
        "name",
        "country",
        "status",
        "calculation_strategy",
        "start_date",
        "end_date",
        "source_url",
        "source_note",
        "verified_on",
    ]:
        value = getattr(default, field)
        if getattr(rate_list, field) != value:
            setattr(rate_list, field, value)
            changed = True

    def year_signature(year: models.RateYear):
        tiers = tuple(
            (
                tier.code,
                tier.name,
                tier.min_rv,
                tier.max_rv,
                tier.min_inclusive,
                tier.max_inclusive,
                tier.rhl_only,
                tier.rate,
            )
            for tier in year.multiplier_tiers
        )
        caps = tuple((cap.category, cap.cap_percent, cap.inflation_factor, cap.appropriate_fraction) for cap in year.transition_caps)
        supplements = tuple(
            (
                rule.code,
                rule.name,
                rule.location_scope,
                rule.min_rv,
                rule.max_rv,
                rule.min_inclusive,
                rule.max_inclusive,
                rule.rate,
                rule.active,
                rule.source_url,
                rule.source_note,
            )
            for rule in year.supplements
        )
        return (
            year.label,
            year.start_date,
            year.end_date,
            year.display_order,
            year.inflation_factor,
            year.source_url,
            year.source_note,
            tiers,
            caps,
            supplements,
        )

    expected_years = [year_signature(year) for year in default.years]
    current_years = [year_signature(year) for year in rate_list.years]
    if current_years != expected_years:
        rate_list.years.clear()
        for year in default.years:
            rate_list.years.append(clone_rate_year(year))
        changed = True

    expected_bands = [
        (band.location_group, band.category, band.min_rv, band.max_rv, band.min_inclusive, band.max_inclusive)
        for band in default.transition_bands
    ]
    current_bands = [
        (band.location_group, band.category, band.min_rv, band.max_rv, band.min_inclusive, band.max_inclusive)
        for band in rate_list.transition_bands
    ]
    if current_bands != expected_bands:
        rate_list.transition_bands.clear()
        for band in default.transition_bands:
            rate_list.transition_bands.append(clone_transition_band(band))
        changed = True

    default_rules = deepcopy(default.advanced_rule_set.rules_json)
    if rate_list.advanced_rule_set:
        if rate_list.advanced_rule_set.rules_json != default_rules:
            rate_list.advanced_rule_set.rules_json = deepcopy(default_rules)
            changed = True
    else:
        rate_list.advanced_rule_set = models.AdvancedRuleSet(rules_json=deepcopy(default_rules))
        changed = True

    return changed


def seed_defaults(db: Session, reset: bool = False):
    if reset:
        db.query(models.Scenario).delete()
        db.query(models.SupplementRule).delete()
        db.query(models.TransitionCap).delete()
        db.query(models.MultiplierTier).delete()
        db.query(models.RateYear).delete()
        db.query(models.TransitionBand).delete()
        db.query(models.RateList).delete()
        db.commit()
    if db.query(models.RateList).count():
        backfilled = False
        existing_codes = {rate_list.code for rate_list in db.query(models.RateList).all()}
        if "england_2023" not in existing_codes:
            db.add(england_2023())
            backfilled = True
        if "england_2026_draft" not in existing_codes:
            db.add(england_2026_draft())
            backfilled = True

        for rate_list in db.query(models.RateList).all():
            if rate_list.code == "england_2023" and not rate_list.advanced_rule_set:
                rate_list.advanced_rule_set = models.AdvancedRuleSet(rules_json=england_2023_advanced_rules())
                backfilled = True
            if rate_list.code == "england_2026_draft" and not rate_list.advanced_rule_set:
                rate_list.advanced_rule_set = models.AdvancedRuleSet(rules_json=england_2026_advanced_rules())
                backfilled = True
            if rate_list.code == "england_2026_draft" and rate_list.advanced_rule_set:
                merged_rules, rules_changed = merge_missing_rules(
                    rate_list.advanced_rule_set.rules_json,
                    england_2026_advanced_rules(),
                )
                if rules_changed:
                    rate_list.advanced_rule_set.rules_json = merged_rules
                    backfilled = True
            if rate_list.code == "england_2026_draft":
                if sync_2026_rate_list(rate_list):
                    backfilled = True
        if backfilled:
            db.commit()
        return
    db.add_all([england_2023(), england_2026_draft()])
    db.commit()
