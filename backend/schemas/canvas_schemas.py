from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any, Dict
from datetime import datetime
from bson import ObjectId


class PyObjectId(ObjectId):    
    @classmethod
    def __get_validators__(cls):
        yield cls.validate
    
    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)
    
    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema):
        field_schema.update(type="string")


class CanvasBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Canvas name")
    description: Optional[str] = Field(None, max_length=500, description="Canvas description")
    content: Dict[str, Any] = Field(default_factory=dict, description="Canvas content data")
    is_favorite: bool = Field(default=False, description="Whether canvas is marked as favorite")
    tags: list[str] = Field(default_factory=list, description="Canvas tags")


class CanvasCreate(CanvasBase):
    """Request schema for creating a canvas. user_id comes from JWT, not request body."""
    pass


class CanvasUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Canvas name")
    description: Optional[str] = Field(None, max_length=500, description="Canvas description") 
    content: Optional[Dict[str, Any]] = Field(None, description="Canvas content data")
    is_favorite: Optional[bool] = Field(None, description="Whether canvas is marked as favorite")
    tags: Optional[list[str]] = Field(None, description="Canvas tags")


class CanvasInDB(CanvasBase):
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_schema_extra={
            "example": {
                "name": "My Canvas",
                "description": "A sample canvas",
                "content": {"elements": [], "settings": {}},
                "is_favorite": False,
                "tags": ["design", "draft"],
                "user_id": "user123"
            }
        }
    )
    
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CanvasResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )
    
    id: str = Field(..., description="Canvas ID")
    name: str = Field(..., description="Canvas name")
    description: Optional[str] = Field(None, description="Canvas description")
    content: Dict[str, Any] = Field(..., description="Canvas content data")
    is_favorite: bool = Field(..., description="Whether canvas is marked as favorite")
    tags: list[str] = Field(..., description="Canvas tags")
    user_id: str = Field(..., description="User ID who owns the canvas")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class CanvasFavoriteUpdate(BaseModel):
    is_favorite: bool = Field(..., description="New favorite status")


class CanvasRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="New canvas name") 