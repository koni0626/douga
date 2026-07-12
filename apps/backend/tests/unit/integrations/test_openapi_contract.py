from douga.api_main import create_app


def test_openapi_documents_personal_bearer_auth_and_automation_routes() -> None:
    contract = create_app().openapi()

    schemes = contract["components"]["securitySchemes"]
    assert schemes["PersonalApiToken"]["type"] == "http"
    assert schemes["PersonalApiToken"]["scheme"] == "bearer"
    project_get = contract["paths"]["/api/v1/projects/{project_id}"]["get"]
    assert {"PersonalApiToken": []} in project_get["security"]
    assert "/api/v1/projects/{project_id}/validate" in contract["paths"]
    assert "/api/v1/projects/{project_id}/previews" in contract["paths"]
    assert "/api/v1/automation/operations/{operation_id}" in contract["paths"]
