"""
Shared utility functions for routers.

This module contains common helper functions used across multiple routers
to avoid code duplication and keep routers clean.
"""

import json
from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from services.credits_service import credits_service
from utils.logger import logger


async def verify_canvas_ownership(
    db: AsyncIOMotorDatabase, canvas_id: str, user_id: str
) -> dict:
    """
    Verify the canvas exists and belongs to the user.

    Args:
        db: Database instance
        canvas_id: Canvas ID to verify
        user_id: User ID to check ownership for

    Returns:
        Canvas document if ownership is verified

    Raises:
        HTTPException: If canvas not found or access denied
    """
    if not ObjectId.is_valid(canvas_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid canvas ID format",
        )

    canvas = await db.canvas.find_one({"_id": ObjectId(canvas_id)})

    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found",
        )

    if canvas["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this canvas",
        )

    return canvas


def canvas_to_dict(canvas: dict) -> dict:
    """
    Convert a canvas document to a dictionary suitable for API responses.

    Args:
        canvas: MongoDB canvas document

    Returns:
        Dictionary with canvas fields formatted for API response
    """
    return {
        "id": str(canvas["_id"]),
        "name": canvas["name"],
        "description": canvas.get("description"),
        "content": canvas.get("content", {}),
        "is_favorite": canvas.get("is_favorite", False),
        "tags": canvas.get("tags", []),
        "user_id": canvas["user_id"],
        "created_at": canvas["created_at"],
        "updated_at": canvas["updated_at"],
    }


async def get_canvas_context(
    db: AsyncIOMotorDatabase, canvas_id: str, user_id: str
) -> dict:
    """
    Get and validate canvas context for AI operations.

    Args:
        db: Database instance
        canvas_id: Canvas ID to get context for
        user_id: User ID to verify access

    Returns:
        Dictionary with canvas context (title, content, description, tags)

    Raises:
        HTTPException: If canvas not found or access denied
    """
    canvas = await verify_canvas_ownership(db, canvas_id, user_id)

    return {
        "title": canvas.get("name", "Untitled Canvas"),
        "content": canvas.get("content", {}),
        "description": canvas.get("description", ""),
        "tags": canvas.get("tags", []),
    }


async def consume_user_credit(user_id: str) -> int:
    """
    Consume one credit from the user's balance.

    Args:
        user_id: The Supabase user UUID

    Returns:
        The remaining credits after consumption

    Raises:
        HTTPException: If insufficient credits or credit service error
    """
    credit_result = await credits_service.consume_credit(user_id, 1)

    if not credit_result.success:
        if credit_result.error == "Insufficient credits":
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Insufficient credits. Please add more credits to continue using AI features.",
            )
        elif credit_result.error == "User profile not found":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found. Please contact support.",
            )
        else:
            logger.error(
                f"Credit consumption failed for user {user_id}: {credit_result.error}"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process credits. Please try again.",
            )

    return credit_result.credits_remaining


async def refund_user_credit(user_id: str) -> None:
    """
    Refund one credit to the user's balance (called on LLM failure).

    Args:
        user_id: The Supabase user UUID
    """
    refund_result = await credits_service.refund_credit(user_id, 1)

    if not refund_result.success:
        # Log the error but don't fail the request - user already saw the LLM error
        logger.error(f"Credit refund failed for user {user_id}: {refund_result.error}")


def format_sse_event(event_type: str, data: dict) -> str:
    """
    Format an SSE (Server-Sent Events) event string.

    Args:
        event_type: Type of event (started, tool_call, etc.)
        data: Event data to serialize

    Returns:
        Formatted SSE event string
    """
    event_data = {"event": event_type, **data}
    return f"data: {json.dumps(event_data)}\n\n"
