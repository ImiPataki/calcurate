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


def test_2026_draft_is_not_calculated():
    response = client.post(
        "/api/calculations/preview",
        json={
            "rate_list_code": "england_2026_draft",
            "location": "england",
            "previous_rv": "10000",
            "current_rv": "12000",
        },
    )

    assert response.status_code == 422
    assert "calculation method is not enabled" in response.json()["detail"]


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
