"""
Pydantic schemas for agent-related API endpoints.
"""

from pydantic import BaseModel, Field


class AgentTaskRequest(BaseModel):

    canvas_id: str = Field(description="ID of the canvas to operate on")
    query: str = Field(description="User's request/instruction for the agent")
    thread_id: str | None = Field(
        default=None,
        description="Optional thread ID for conversation persistence",
    )


class AgentTaskResponse(BaseModel):

    success: bool = Field(description="Whether the task completed successfully")
    message: str = Field(description="Agent's response message")
    canvas_id: str = Field(description="ID of the canvas that was modified")

