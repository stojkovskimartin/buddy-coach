"""HTTP endpoints for authentication and the current account."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from buddy_coach.identity.deps import CurrentUserDep, get_identity_service
from buddy_coach.identity.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserOut,
)
from buddy_coach.identity.service import IdentityService

router = APIRouter(tags=["auth"])
ServiceDep = Annotated[IdentityService, Depends(get_identity_service)]


@router.post("/auth/register", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def register(body: RegisterRequest, service: ServiceDep) -> UserOut:
    """Create an account."""
    user = await service.register(body.email, body.password)
    return UserOut.model_validate(user)


@router.post("/auth/login", response_model=TokenPair)
async def login(body: LoginRequest, service: ServiceDep) -> TokenPair:
    """Log in with email and password."""
    return await service.login(body.email, body.password)


@router.post("/auth/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, service: ServiceDep) -> TokenPair:
    """Rotate the refresh token and get a new access token."""
    return await service.refresh(body.refresh_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, service: ServiceDep) -> None:
    """Revoke a refresh token."""
    await service.logout(body.refresh_token)


@router.get("/users/me", response_model=UserOut, tags=["users"])
async def me(current: CurrentUserDep, service: ServiceDep) -> UserOut:
    """Return the authenticated account."""
    return UserOut.model_validate(await service.get_user(current.id))
