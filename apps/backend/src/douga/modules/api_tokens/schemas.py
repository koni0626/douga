from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ApiTokenCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] = Field(min_length=1, max_length=20)
    expires_at: datetime | None = None


class ApiTokenResponse(BaseModel):
    id: UUID
    name: str
    token_prefix: str
    scopes: list[str]
    last_used_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class ApiTokenIssuedResponse(ApiTokenResponse):
    token: str


class ApiTokenListResponse(BaseModel):
    items: list[ApiTokenResponse]
