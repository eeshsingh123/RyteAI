import logging
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth.supabase_auth import get_current_user, CurrentUser
from database.connection import get_database
from schemas.ai_schemas import (
    InstructionExecuteRequest,
    InstructionExecuteResponse,
    ImproveTextRequest,
    ImproveTextResponse,
)
from services.llm_service import llm_service
from services.credits_service import credits_service

logger = logging.getLogger(__name__)

# Create router instance
router = APIRouter(
    prefix="/ai", tags=["ai"], responses={404: {"description": "Not found"}}
)


async def get_canvas_context(
    db: AsyncIOMotorDatabase, canvas_id: str, user_id: str
) -> dict:
    """Helper to get and validate canvas context."""
    if not ObjectId.is_valid(canvas_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid canvas ID format"
        )

    canvas = await db.canvas.find_one({"_id": ObjectId(canvas_id)})

    if not canvas:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found"
        )

    if canvas["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this canvas"
        )

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
            logger.error(f"Credit consumption failed for user {user_id}: {credit_result.error}")
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


@router.post("/execute-instruction", response_model=InstructionExecuteResponse)
async def execute_instruction(
    request: InstructionExecuteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> InstructionExecuteResponse:
    """Execute an AI instruction with canvas context."""
    credits_remaining = None
    credit_consumed = False
    
    try:
        # Validate canvas ownership using user_id from JWT
        canvas_context = await get_canvas_context(
            db, request.canvas_id, current_user.user_id
        )

        # Consume credit before LLM call
        credits_remaining = await consume_user_credit(current_user.user_id)
        credit_consumed = True
        
        ai_response = await llm_service.execute_instruction(
            instruction=request.instruction, canvas_context=canvas_context
        )

        logger.info(f"AI instruction executed for canvas {request.canvas_id} by user {current_user.user_id}")

        return InstructionExecuteResponse(
            success=True, 
            response=ai_response, 
            error=None,
            credits_remaining=credits_remaining
        )

    except HTTPException:
        # If credit was consumed but we hit an HTTPException after LLM call started,
        # we don't refund (the credit was legitimately used)
        raise
    except ValueError as e:
        # LLM service error - refund the credit
        if credit_consumed:
            await refund_user_credit(current_user.user_id)
            credits_remaining = (credits_remaining + 1) if credits_remaining is not None else None
        logger.error(f"LLM service error: {e}")
        return InstructionExecuteResponse(
            success=False, 
            response="", 
            error=str(e),
            credits_remaining=credits_remaining
        )
    except Exception as e:
        # Unexpected error - refund the credit
        if credit_consumed:
            await refund_user_credit(current_user.user_id)
            credits_remaining = (credits_remaining + 1) if credits_remaining is not None else None
        logger.error(f"Error executing AI instruction: {e}")
        return InstructionExecuteResponse(
            success=False,
            response="",
            error="Failed to process your instruction. Please try again.",
            credits_remaining=credits_remaining
        )


@router.post("/improve-text", response_model=ImproveTextResponse)
async def improve_text(
    request: ImproveTextRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ImproveTextResponse:
    """Improve selected text based on the specified action."""
    credits_remaining = None
    credit_consumed = False
    
    try:
        # Validate canvas ownership using user_id from JWT
        canvas_context = await get_canvas_context(
            db, request.canvas_id, current_user.user_id
        )

        # Consume credit before LLM call
        credits_remaining = await consume_user_credit(current_user.user_id)
        credit_consumed = True

        improved_text = await llm_service.improve_text(
            selected_text=request.selected_text,
            action=request.action,
            canvas_context=canvas_context,
        )

        logger.info(
            f"Text improved for canvas {request.canvas_id}, action: {request.action} by user {current_user.user_id}"
        )

        return ImproveTextResponse(
            success=True, 
            improved_text=improved_text, 
            error=None,
            credits_remaining=credits_remaining
        )

    except HTTPException:
        raise
    except ValueError as e:
        # LLM service error - refund the credit
        if credit_consumed:
            await refund_user_credit(current_user.user_id)
            credits_remaining = (credits_remaining + 1) if credits_remaining is not None else None
        logger.error(f"LLM service error: {e}")
        return ImproveTextResponse(
            success=False, 
            improved_text="", 
            error=str(e),
            credits_remaining=credits_remaining
        )
    except Exception as e:
        # Unexpected error - refund the credit
        if credit_consumed:
            await refund_user_credit(current_user.user_id)
            credits_remaining = (credits_remaining + 1) if credits_remaining is not None else None
        logger.error(f"Error improving text: {e}")
        return ImproveTextResponse(
            success=False,
            improved_text="",
            error="Failed to improve text. Please try again.",
            credits_remaining=credits_remaining
        )


@router.get("/credits")
async def get_user_credits(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Get the current user's credit balance."""
    user_credits = await credits_service.get_credits(current_user.user_id)
    
    if user_credits is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found",
        )
    
    return {"credits": user_credits}
