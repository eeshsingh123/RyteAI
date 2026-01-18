from schemas.ai_schemas import (
    InstructionExecuteRequest,
    InstructionExecuteResponse,
    ImproveTextRequest,
    ImproveTextResponse,
)
from schemas.agent_schemas import (
    AgentTaskRequest,
    AgentTaskResponse,
)
from schemas.canvas_schemas import (
    CanvasCreate,
    CanvasUpdate,
    CanvasResponse,
    CanvasFavoriteUpdate,
    CanvasRename,
)

__all__ = [
    # AI schemas
    "InstructionExecuteRequest",
    "InstructionExecuteResponse",
    "ImproveTextRequest",
    "ImproveTextResponse",
    # Agent schemas
    "AgentTaskRequest",
    "AgentTaskResponse",
    # Canvas schemas
    "CanvasCreate",
    "CanvasUpdate",
    "CanvasResponse",
    "CanvasFavoriteUpdate",
    "CanvasRename",
]
