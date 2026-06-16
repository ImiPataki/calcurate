from decimal import Decimal

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


client = TestClient(app)


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with client:
        pass


def test_transcript_example_2023_24():
    response = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2023",
            "location": "england",
            "previous_rv": "15000",
            "current_rv": "30000",
            "liability_start_date": "2023-04-01",
            "liability_end_date": "2024-03-31",
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()
    first_year = data["annual"][0]
    assert Decimal(first_year["base_liability"]) == Decimal("7485.00")
    assert Decimal(first_year["notional_chargeable_amount"]) == Decimal("14970.00")
    assert Decimal(first_year["transitional_limit"]) == Decimal("8607.75")
    assert first_year["transition_applies"] is True
    assert Decimal(first_year["transitional_relief"]) == Decimal("-6362.25")
    assert Decimal(first_year["total"]) == Decimal("8607.75")


def test_standard_supplement_threshold():
    response = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2023",
            "location": "england",
            "previous_rv": "51000",
            "current_rv": "51000",
            "liability_start_date": "2023-04-01",
            "liability_end_date": "2024-03-31",
        },
    )

    assert response.status_code == 200, response.text
    lines = response.json()["annual"][0]["lines"]
    supplement = next(line for line in lines if line["code"] == "standard_supplement")
    assert Decimal(supplement["amount"]) == Decimal("663.00")


def test_crossrail_threshold_is_exclusive():
    at_threshold = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2023",
            "location": "greater_london",
            "previous_rv": "75000",
            "current_rv": "75000",
            "liability_start_date": "2023-04-01",
            "liability_end_date": "2024-03-31",
        },
    )
    above_threshold = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2023",
            "location": "greater_london",
            "previous_rv": "75001",
            "current_rv": "75001",
            "liability_start_date": "2023-04-01",
            "liability_end_date": "2024-03-31",
        },
    )

    assert at_threshold.status_code == 200, at_threshold.text
    assert above_threshold.status_code == 200, above_threshold.text
    at_line = next(line for line in at_threshold.json()["annual"][0]["lines"] if line["code"] == "crossrail")
    above_line = next(line for line in above_threshold.json()["annual"][0]["lines"] if line["code"] == "crossrail")
    assert Decimal(at_line["amount"]) == Decimal("0.00")
    assert Decimal(above_line["amount"]) == Decimal("1500.02")


def test_2026_calculates_with_current_multiplier_structure():
    response = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2026_draft",
            "location": "england",
            "previous_rv": "10000",
            "current_rv": "12000",
        },
    )

    assert response.status_code == 200, response.text
    annual = response.json()["annual"]
    assert len(annual) == 3
    first_year = annual[0]
    assert Decimal(first_year["base_liability"]) == Decimal("4990.00")
    assert Decimal(first_year["notional_chargeable_amount"]) == Decimal("5304.00")
    assert Decimal(first_year["transitional_limit"]) == Decimal("5239.50")
    assert first_year["transition_applies"] is True
    assert not any(line["code"] == "transitional_supplement" for line in first_year["lines"])
    assert Decimal(first_year["total"]) == Decimal("5239.50")
    assert Decimal(annual[1]["total"]) == Decimal("5400.00")
    assert Decimal(annual[2]["total"]) == Decimal("5628.00")


def test_2026_previous_standard_multiplier_sets_base_liability():
    response = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2026_draft",
            "location": "england",
            "previous_rv": "51000",
            "current_rv": "60000",
        },
    )

    assert response.status_code == 200, response.text
    first_year = response.json()["annual"][0]
    assert Decimal(first_year["base_liability"]) == Decimal("28305.00")
    assert Decimal(first_year["notional_chargeable_amount"]) == Decimal("28800.00")
    assert first_year["transition_applies"] is False
    supplement = next(line for line in first_year["lines"] if line["code"] == "transitional_supplement")
    assert Decimal(supplement["amount"]) == Decimal("600.00")
    assert Decimal(first_year["total"]) == Decimal("29400.00")
    assert Decimal(response.json()["annual"][1]["base_liability"]) == Decimal("32550.75")
    assert Decimal(response.json()["annual"][1]["total"]) == Decimal("30000.00")
    assert Decimal(response.json()["annual"][2]["total"]) == Decimal("31260.00")


def test_2026_transitional_supplement_not_charged_when_transition_applies():
    response = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2026_draft",
            "location": "england",
            "previous_rv": "51000",
            "current_rv": "100000",
        },
    )

    assert response.status_code == 200, response.text
    first_year = response.json()["annual"][0]
    assert first_year["transition_applies"] is True
    assert Decimal(first_year["base_liability"]) == Decimal("28305.00")
    assert Decimal(first_year["transitional_limit"]) == Decimal("32550.75")
    assert Decimal(first_year["total"]) == Decimal("32550.75")
    assert not any(line["code"] == "transitional_supplement" for line in first_year["lines"])
    second_year = response.json()["annual"][1]
    third_year = response.json()["annual"][2]
    assert second_year["transition_applies"] is True
    assert Decimal(second_year["transitional_limit"]) == Decimal("42397.35")
    assert Decimal(second_year["total"]) == Decimal("42397.35")
    assert third_year["transition_applies"] is False
    assert Decimal(third_year["total"]) == Decimal("52100.00")


def test_2026_new_entry_does_not_charge_transitional_supplement():
    response = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2026_draft",
            "location": "england",
            "previous_rv": "0",
            "current_rv": "12000",
        },
    )

    assert response.status_code == 200, response.text
    first_year = response.json()["annual"][0]
    assert first_year["transition_applies"] is False
    assert Decimal(first_year["total"]) == Decimal("5184.00")
    assert not any(line["code"] == "transitional_supplement" for line in first_year["lines"])


def advanced_request(original=None, revised=None, **overrides):
    base_side = {
        "prior_rv": "15000",
        "start_rv": "30000",
        "payable_percent": "1",
        "vacant": False,
        "charity": False,
        "is_rhl": False,
        "retail_relief": False,
        "ssbr_current": False,
        "ssbr_previous": False,
        "sbrr_by_year": [False, False, False],
        "certificate": {"certificate_type": "reg18_dos"},
        "improvement_reliefs": [],
        "changes": [],
    }
    payload = {
        "rate_list_code": "england_2023",
        "location": "england",
        "hypothetical": False,
        "allow_dates_any_order": False,
        "include_placeholders": True,
        "original": {**base_side, **(original or {})},
        "revised": {**base_side, **(revised or {})},
    }
    payload.update(overrides)
    return payload


def test_advanced_same_original_and_revised_has_zero_saving():
    response = client.post("/api/advanced-calculations/preview", json=advanced_request())

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["issues"] == []
    assert Decimal(data["total_saving"]) == Decimal("0.00")
    assert Decimal(data["comparison"][0]["original_total"]) == Decimal("8607.75")


def test_advanced_2026_uses_workbook_transition_core():
    response = client.post(
        "/api/advanced-calculations/preview",
        json=advanced_request(
            original={"prior_rv": "10000", "start_rv": "12000"},
            revised={"prior_rv": "10000", "start_rv": "12000"},
            rate_list_code="england_2026_draft",
        ),
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["issues"] == []
    assert Decimal(data["original"][0]["total"]) == Decimal("5239.50")
    assert Decimal(data["original"][1]["total"]) == Decimal("5400.00")
    assert Decimal(data["original"][2]["total"]) == Decimal("5628.00")
    assert Decimal(data["total_saving"]) == Decimal("0.00")


def test_advanced_revised_reduction_has_saving():
    response = client.post(
        "/api/advanced-calculations/preview",
        json=advanced_request(revised={"start_rv": "25000"}),
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["issues"] == []
    assert Decimal(data["total_saving"]) > Decimal("0.00")


def test_advanced_out_of_sequence_dates_are_validation_errors():
    response = client.post(
        "/api/advanced-calculations/preview",
        json=advanced_request(
            original={
                "changes": [
                    {"from_date": "2024-04-01", "rv": "32000", "payable_percent": "1", "vacant": False},
                    {"from_date": "2023-06-01", "rv": "31000", "payable_percent": "1", "vacant": False},
                ]
            }
        ),
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["comparison"] == []
    assert any("out of sequence" in item["message"] for item in data["issues"])


def test_advanced_scenario_crud():
    create_response = client.post(
        "/api/advanced-scenarios",
        json={"name": "Advanced reduction", "request": advanced_request(revised={"start_rv": "25000"})},
    )
    assert create_response.status_code == 200, create_response.text
    scenario_id = create_response.json()["id"]

    list_response = client.get("/api/advanced-scenarios")
    assert list_response.status_code == 200
    assert any(item["id"] == scenario_id for item in list_response.json())

    delete_response = client.delete(f"/api/advanced-scenarios/{scenario_id}")
    assert delete_response.status_code == 200


def test_scenario_crud():
    create_response = client.post(
        "/api/scenarios",
        json={
            "name": "Corner shop reduction",
            "request": {
                "rate_list_code": "england_2023",
                "location": "england",
                "previous_rv": "15000",
                "current_rv": "25000",
            },
        },
    )
    assert create_response.status_code == 200, create_response.text
    scenario_id = create_response.json()["id"]

    list_response = client.get("/api/scenarios")
    assert list_response.status_code == 200
    assert any(item["id"] == scenario_id for item in list_response.json())

    delete_response = client.delete(f"/api/scenarios/{scenario_id}")
    assert delete_response.status_code == 200
