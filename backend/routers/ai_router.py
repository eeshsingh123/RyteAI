from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
import logging

from database.connection import get_database
from schemas.ai_schemas import InstructionExecuteRequest, InstructionExecuteResponse

logger = logging.getLogger(__name__)

# Create router instance
router = APIRouter(
    prefix="/ai",
    tags=["ai"],
    responses={404: {"description": "Not found"}}
)


@router.post("/execute-instruction", response_model=InstructionExecuteResponse)
async def execute_instruction(
    request: InstructionExecuteRequest,
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> InstructionExecuteResponse:
    """
    Execute an AI instruction with canvas context.
    """
    try:
        # Validate ObjectId
        if not ObjectId.is_valid(request.canvas_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid canvas ID format"
            )
        
        # Get canvas for context
        canvas = await db.canvas.find_one({"_id": ObjectId(request.canvas_id)})
        
        if not canvas:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canvas not found"
            )
        
        # Verify user owns the canvas
        if canvas["user_id"] != request.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this canvas"
            )
        
        # Prepare context for AI
        canvas_context = {
            "title": canvas.get("name", "Untitled Canvas"),
            "content": canvas.get("content", {}),
            "description": canvas.get("description", ""),
            "tags": canvas.get("tags", [])
        }
        
        # TODO: Replace with actual AI/LLM service call
        # For now, return a mock response
        ai_response = f"Based on your canvas '{canvas_context['title']}', here's my response to: {request.instruction}\n\nThis is a placeholder response. In a real implementation, this would be processed by an LLM service with the full canvas context."
        
        logger.info(f"AI instruction executed for canvas {request.canvas_id}")
        
        return InstructionExecuteResponse(
            success=True,
            response=ai_response,
            error=None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing AI instruction: {e}")
        return InstructionExecuteResponse(
            success=False,
            response="",
            error="Failed to process your instruction. Please try again."
        )