from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth.supabase_auth import get_current_user, CurrentUser
from database.connection import get_database
from utils.router_utils import (
    get_canvas_context,
    consume_user_credit,
    refund_user_credit,
)
from utils.logger import logger
from schemas.ai_schemas import (
    InstructionExecuteRequest,
    InstructionExecuteResponse,
    ImproveTextRequest,
    ImproveTextResponse,
)
from services.llm_service import llm_service
from services.credits_service import credits_service


router = APIRouter(
    prefix="/ai", tags=["ai"], responses={404: {"description": "Not found"}}
)


@router.post("/execute-instruction", response_model=InstructionExecuteResponse)
async def execute_instruction(
    request: InstructionExecuteRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> InstructionExecuteResponse:

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

        logger.info(
            f"AI instruction executed for canvas {request.canvas_id} by user {current_user.user_id}"
        )

        return InstructionExecuteResponse(
            success=True,
            response=ai_response,
            error=None,
            credits_remaining=credits_remaining,
        )

    except HTTPException:
        # If credit was consumed but we hit an HTTPException after LLM call started,
        # we don't refund (the credit was legitimately used)
        raise
    except ValueError as e:
        # LLM service error - refund the credit
        if credit_consumed:
            await refund_user_credit(current_user.user_id)
            credits_remaining = (
                (credits_remaining + 1) if credits_remaining is not None else None
            )
        logger.error(f"LLM service error: {e}")
        return InstructionExecuteResponse(
            success=False,
            response="",
            error=str(e),
            credits_remaining=credits_remaining,
        )
    except Exception as e:
        # Unexpected error - refund the credit
        if credit_consumed:
            await refund_user_credit(current_user.user_id)
            credits_remaining = (
                (credits_remaining + 1) if credits_remaining is not None else None
            )
        logger.error(f"Error executing AI instruction: {e}")
        return InstructionExecuteResponse(
            success=False,
            response="",
            error="Failed to process your instruction. Please try again.",
            credits_remaining=credits_remaining,
        )


@router.post("/improve-text", response_model=ImproveTextResponse)
async def improve_text(
    request: ImproveTextRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ImproveTextResponse:

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
            credits_remaining=credits_remaining,
        )

    except HTTPException:
        raise
    except ValueError as e:
        # LLM service error - refund the credit
        if credit_consumed:
            await refund_user_credit(current_user.user_id)
            credits_remaining = (
                (credits_remaining + 1) if credits_remaining is not None else None
            )
        logger.error(f"LLM service error: {e}")
        return ImproveTextResponse(
            success=False,
            improved_text="",
            error=str(e),
            credits_remaining=credits_remaining,
        )
    except Exception as e:
        # Unexpected error - refund the credit
        if credit_consumed:
            await refund_user_credit(current_user.user_id)
            credits_remaining = (
                (credits_remaining + 1) if credits_remaining is not None else None
            )
        logger.error(f"Error improving text: {e}")
        return ImproveTextResponse(
            success=False,
            improved_text="",
            error="Failed to improve text. Please try again.",
            credits_remaining=credits_remaining,
        )


@router.get("/credits")
async def get_user_credits(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:

    user_credits = await credits_service.get_credits(current_user.user_id)

    if user_credits is None:
        raise HTTPException(
            status_code=404,
            detail="User profile not found",
        )

    return {"credits": user_credits}
