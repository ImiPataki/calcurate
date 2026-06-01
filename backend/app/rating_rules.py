from decimal import Decimal
from typing import Any

from fastapi import HTTPException

from app import models


def rules_for(rate_list: models.RateList) -> dict[str, Any]:
    return rate_list.advanced_rule_set.rules_json if rate_list.advanced_rule_set else {}


def rule_decimal(rules: dict, path: list[str], default: str) -> Decimal:
    value = rules
    for key in path:
        if not isinstance(value, dict) or key not in value:
            return Decimal(default)
        value = value[key]
    return Decimal(str(value))


def _range_matches(value: Decimal, rule: dict[str, Any]) -> bool:
    minimum = rule.get("min_rv")
    maximum = rule.get("max_rv")
    min_inclusive = bool(rule.get("min_inclusive", True))
    max_inclusive = bool(rule.get("max_inclusive", True))

    if minimum is not None:
        minimum = Decimal(str(minimum))
        if min_inclusive and value < minimum:
            return False
        if not min_inclusive and value <= minimum:
            return False
    if maximum is not None:
        maximum = Decimal(str(maximum))
        if max_inclusive and value > maximum:
            return False
        if not max_inclusive and value >= maximum:
            return False
    return True


def previous_list_multiplier_for_rv(
    rate_list: models.RateList,
    rv: Decimal,
    fallback: Decimal | None = None,
) -> Decimal:
    """Resolve the prior-list multiplier from configurable RV tiers.

    Rating-list revaluations can change the prior base-liability basis. Keeping
    the tiers in rules JSON lets a future list define a different predecessor
    structure without adding another calculation branch.
    """
    rules = rules_for(rate_list)
    for tier in rules.get("previous_list_multiplier_tiers", []):
        if _range_matches(rv, tier):
            return Decimal(str(tier["rate"]))

    value = rules.get("previous_list_small_multiplier")
    if value is not None:
        return Decimal(str(value))
    if fallback is not None:
        return fallback
    raise HTTPException(status_code=422, detail=f"No previous-list multiplier configured for rv={rv}")


def supplement_allowed(rate_list: models.RateList, code: str, context: dict[str, bool] | None = None) -> bool:
    """Apply data-driven supplement conditions.

    Supported rule shape:
    {
      "supplement_conditions": {
        "transitional_supplement": {
          "exclude_when_any": ["transition_applies", "ssbr_applies"]
        }
      }
    }
    """
    context = context or {}
    conditions = rules_for(rate_list).get("supplement_conditions", {}).get(code, {})

    for key in conditions.get("exclude_when_any", []):
        if context.get(key):
            return False
    for key in conditions.get("include_when_all", []):
        if not context.get(key):
            return False
    return True
