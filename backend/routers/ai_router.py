import logging
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from database.connection import get_database
from schemas.ai_schemas import (
    InstructionExecuteRequest,
    InstructionExecuteResponse,
    ImproveTextRequest,
    ImproveTextResponse,
)
from services.llm_service import llm_service

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


@router.post("/execute-instruction", response_model=InstructionExecuteResponse)
async def execute_instruction(
    request: InstructionExecuteRequest, db: AsyncIOMotorDatabase = Depends(get_database)
) -> InstructionExecuteResponse:
    """Execute an AI instruction with canvas context."""
    try:
        canvas_context = await get_canvas_context(
            db, request.canvas_id, request.user_id
        )

        ai_response = await llm_service.execute_instruction(
            instruction=request.instruction, canvas_context=canvas_context
        )

        logger.info(f"AI instruction executed for canvas {request.canvas_id}")

        return InstructionExecuteResponse(
            success=True, response=ai_response, error=None
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"LLM service error: {e}")
        return InstructionExecuteResponse(success=False, response="", error=str(e))
    except Exception as e:
        logger.error(f"Error executing AI instruction: {e}")
        return InstructionExecuteResponse(
            success=False,
            response="",
            error="Failed to process your instruction. Please try again.",
        )


@router.post("/improve-text", response_model=ImproveTextResponse)
async def improve_text(
    request: ImproveTextRequest, db: AsyncIOMotorDatabase = Depends(get_database)
) -> ImproveTextResponse:
    """Improve selected text based on the specified action."""
    try:
        canvas_context = await get_canvas_context(
            db, request.canvas_id, request.user_id
        )

        improved_text = await llm_service.improve_text(
            selected_text=request.selected_text,
            action=request.action,
            canvas_context=canvas_context,
        )

        logger.info(
            f"Text improved for canvas {request.canvas_id}, action: {request.action}"
        )

        return ImproveTextResponse(
            success=True, improved_text=improved_text, error=None
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"LLM service error: {e}")
        return ImproveTextResponse(success=False, improved_text="", error=str(e))
    except Exception as e:
        logger.error(f"Error improving text: {e}")
        return ImproveTextResponse(
            success=False,
            improved_text="",
            error="Failed to improve text. Please try again.",
        )
