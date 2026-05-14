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
        source_note="Active 2026/27 method uses official multipliers and transitional-relief rules; later years need rates when announced.",
        verified_on=date(2026, 5, 14),
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
    rate_list.years = [year]
    return rate_list


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
    existing = db.query(models.RateList).count()
    if existing:
        backfilled = False
        for rate_list in db.query(models.RateList).all():
            if rate_list.code == "england_2023" and not rate_list.advanced_rule_set:
                rate_list.advanced_rule_set = models.AdvancedRuleSet(rules_json=england_2023_advanced_rules())
                backfilled = True
            if rate_list.code == "england_2026_draft" and not rate_list.advanced_rule_set:
                rate_list.advanced_rule_set = models.AdvancedRuleSet(rules_json=england_2026_advanced_rules())
                backfilled = True
            if rate_list.code == "england_2026_draft":
                if rate_list.status != "active":
                    rate_list.status = "active"
                    backfilled = True
                if rate_list.calculation_strategy != "england_2026":
                    rate_list.calculation_strategy = "england_2026"
                    backfilled = True
                if rate_list.name.endswith("Draft"):
                    rate_list.name = "England 2026 Rating List"
                    backfilled = True
        if backfilled:
            db.commit()
        return
    db.add_all([england_2023(), england_2026_draft()])
    db.commit()
