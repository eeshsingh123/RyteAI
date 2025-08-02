from pydantic import BaseModel, Field
from typing import Dict, Any, Optional


class InstructionExecuteRequest(BaseModel):
    canvas_id: str = Field(..., description="Canvas ID for context")
    user_id: str = Field(..., description="User ID for authorization")
    instruction: str = Field(..., min_length=1, max_length=2000, description="AI instruction to execute")


class InstructionExecuteResponse(BaseModel):
    success: bool = Field(..., description="Whether the instruction was executed successfully")
    response: str = Field(..., description="AI generated response")
    error: Optional[str] = Field(None, description="Error message if execution failed")