from pydantic import BaseModel, Field
from typing import Optional, Literal


class InstructionExecuteRequest(BaseModel):
    canvas_id: str = Field(..., description="Canvas ID for context")
    instruction: str = Field(
        ..., min_length=1, max_length=2000, description="AI instruction to execute"
    )


class InstructionExecuteResponse(BaseModel):
    success: bool = Field(
        ..., description="Whether the instruction was executed successfully"
    )
    response: str = Field(..., description="AI generated response")
    error: Optional[str] = Field(None, description="Error message if execution failed")
    credits_remaining: Optional[int] = Field(None, description="Remaining credits after operation")


class ImproveTextRequest(BaseModel):
    canvas_id: str = Field(..., description="Canvas ID for context")
    selected_text: str = Field(
        ..., min_length=1, max_length=10000, description="Text selected by the user"
    )
    action: Literal[
        "improve", "rephrase", "summarize", "expand", "simplify", "formal", "casual"
    ] = Field("improve", description="The improvement action to perform")


class ImproveTextResponse(BaseModel):
    success: bool = Field(..., description="Whether the improvement was successful")
    improved_text: str = Field(..., description="The improved text")
    error: Optional[str] = Field(
        None, description="Error message if improvement failed"
    )
    credits_remaining: Optional[int] = Field(None, description="Remaining credits after operation")