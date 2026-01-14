from datetime import datetime
import logging
from typing import List
from bson import ObjectId

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth.supabase_auth import get_current_user, CurrentUser
from database.connection import get_database
from schemas.canvas_schemas import (
    CanvasCreate,
    CanvasUpdate,
    CanvasResponse,
    CanvasFavoriteUpdate,
    CanvasRename,
)

logger = logging.getLogger(__name__)

# Create router instance
router = APIRouter(
    prefix="/canvas", tags=["canvas"], responses={404: {"description": "Not found"}}
)


def canvas_helper(canvas) -> dict:
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


async def verify_canvas_ownership(
    db: AsyncIOMotorDatabase, canvas_id: str, user_id: str
) -> dict:
    """Verify the canvas exists and belongs to the current user."""
    if not ObjectId.is_valid(canvas_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid canvas ID format",
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

    return canvas


@router.post("/", response_model=CanvasResponse, status_code=status.HTTP_201_CREATED)
async def create_canvas(
    canvas: CanvasCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CanvasResponse:
    try:
        # Prepare canvas document with user_id from JWT
        canvas_dict = canvas.model_dump()
        canvas_dict["user_id"] = current_user.user_id
        canvas_dict["created_at"] = datetime.utcnow()
        canvas_dict["updated_at"] = datetime.utcnow()

        # Insert into database
        result = await db.canvas.insert_one(canvas_dict)

        # Get the created canvas
        created_canvas = await db.canvas.find_one({"_id": result.inserted_id})

        if not created_canvas:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create canvas",
            )

        logger.info(f"Canvas created successfully: {result.inserted_id} by user {current_user.user_id}")
        return CanvasResponse(**canvas_helper(created_canvas))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating canvas: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from e


@router.get("/", response_model=List[CanvasResponse])
async def get_canvases(
    favorites_only: bool = Query(False, description="Show only favorite canvases"),
    skip: int = Query(0, ge=0, description="Number of canvases to skip"),
    limit: int = Query(
        100, ge=1, le=100, description="Maximum number of canvases to return"
    ),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[CanvasResponse]:
    try:
        # Build query filter using user_id from JWT
        query_filter = {"user_id": current_user.user_id}
        if favorites_only:
            query_filter["is_favorite"] = True

        # Get canvases with pagination
        cursor = (
            db.canvas.find(query_filter).skip(skip).limit(limit).sort("updated_at", -1)
        )
        canvases = await cursor.to_list(length=limit)

        return [CanvasResponse(**canvas_helper(canvas)) for canvas in canvases]

    except Exception as e:
        logger.error(f"Error fetching canvases: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get("/{canvas_id}", response_model=CanvasResponse)
async def get_canvas(
    canvas_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CanvasResponse:
    try:
        canvas = await verify_canvas_ownership(db, canvas_id, current_user.user_id)
        return CanvasResponse(**canvas_helper(canvas))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching canvas {canvas_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.put("/{canvas_id}", response_model=CanvasResponse)
async def update_canvas(
    canvas_id: str,
    canvas_update: CanvasUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CanvasResponse:
    try:
        # Verify ownership first
        await verify_canvas_ownership(db, canvas_id, current_user.user_id)

        # Prepare update data
        update_data = canvas_update.model_dump(exclude_unset=True)
        if update_data:
            update_data["updated_at"] = datetime.utcnow()

        # Update canvas
        result = await db.canvas.update_one(
            {"_id": ObjectId(canvas_id)}, {"$set": update_data}
        )

        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found"
            )

        # Get updated canvas
        updated_canvas = await db.canvas.find_one({"_id": ObjectId(canvas_id)})

        logger.info(f"Canvas updated successfully: {canvas_id}")
        return CanvasResponse(**canvas_helper(updated_canvas))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating canvas {canvas_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.patch("/{canvas_id}/favorite", response_model=CanvasResponse)
async def toggle_canvas_favorite(
    canvas_id: str,
    favorite_update: CanvasFavoriteUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CanvasResponse:
    try:
        # Verify ownership first
        await verify_canvas_ownership(db, canvas_id, current_user.user_id)

        # Update favorite status
        result = await db.canvas.update_one(
            {"_id": ObjectId(canvas_id)},
            {
                "$set": {
                    "is_favorite": favorite_update.is_favorite,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found"
            )

        # Get updated canvas
        updated_canvas = await db.canvas.find_one({"_id": ObjectId(canvas_id)})

        logger.info(f"Canvas favorite status updated: {canvas_id}")
        return CanvasResponse(**canvas_helper(updated_canvas))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating favorite status for canvas {canvas_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.patch("/{canvas_id}/rename", response_model=CanvasResponse)
async def rename_canvas(
    canvas_id: str,
    rename_data: CanvasRename,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CanvasResponse:
    try:
        # Verify ownership first
        await verify_canvas_ownership(db, canvas_id, current_user.user_id)

        # Update canvas name
        result = await db.canvas.update_one(
            {"_id": ObjectId(canvas_id)},
            {"$set": {"name": rename_data.name, "updated_at": datetime.utcnow()}},
        )

        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found"
            )

        # Get updated canvas
        updated_canvas = await db.canvas.find_one({"_id": ObjectId(canvas_id)})

        logger.info(f"Canvas renamed successfully: {canvas_id}")
        return CanvasResponse(**canvas_helper(updated_canvas))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renaming canvas {canvas_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.delete("/{canvas_id}")
async def delete_canvas(
    canvas_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> JSONResponse:
    try:
        # Verify ownership first
        await verify_canvas_ownership(db, canvas_id, current_user.user_id)

        # Delete canvas
        result = await db.canvas.delete_one({"_id": ObjectId(canvas_id)})

        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found"
            )

        logger.info(f"Canvas deleted successfully: {canvas_id}")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": "Canvas deleted successfully"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting canvas {canvas_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )
