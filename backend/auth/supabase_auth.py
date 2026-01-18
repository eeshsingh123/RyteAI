"""
Supabase JWT Authentication for FastAPI

This module provides JWT verification for Supabase Auth tokens.
Supports both HS256 (symmetric) and ES256/RS256 (asymmetric) algorithms.
"""

from typing import Optional
from dataclasses import dataclass
from functools import lru_cache

import jwt
from jwt import PyJWKClient, PyJWKClientError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import settings
from utils.logger import logger

# HTTP Bearer token scheme
security = HTTPBearer()


@dataclass
class CurrentUser:
    """Represents the authenticated user from the JWT."""

    user_id: str
    email: Optional[str] = None


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    """Get or create the JWKS client for fetching public keys (cached)."""
    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)


def verify_jwt(token: str) -> dict:
    """
    Verify a Supabase JWT token and return its payload.

    Supports:
    - HS256: Uses SUPABASE_JWT_SECRET for verification
    - ES256/RS256: Fetches public key from Supabase JWKS endpoint (cached)
    """
    try:
        # Decode header to check algorithm
        unverified_header = jwt.get_unverified_header(token)
        token_alg = unverified_header.get("alg", "HS256")

        # Choose verification method based on algorithm
        if token_alg == "HS256":
            # Symmetric algorithm - use JWT secret
            if not settings.supabase_jwt_secret:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Server authentication configuration error",
                )

            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        else:
            # Asymmetric algorithm (ES256, RS256) - fetch public key from JWKS
            try:
                jwks_client = _get_jwks_client()
                signing_key = jwks_client.get_signing_key_from_jwt(token)

                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[token_alg],
                    audience="authenticated",
                )
            except PyJWKClientError as e:
                logger.warning(f"JWKS fetch failed: {e}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Unable to verify token signature",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError as e:
        logger.warning(f"JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    """
    FastAPI dependency to get the current authenticated user from the JWT.
    """
    token = credentials.credentials
    payload = verify_jwt(token)

    # Extract user_id from the 'sub' claim (Supabase standard)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Optionally extract email if present
    email = payload.get("email")

    return CurrentUser(user_id=user_id, email=email)
