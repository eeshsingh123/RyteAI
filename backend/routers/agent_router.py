from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth.supabase_auth import get_current_user, CurrentUser
from database.connection import get_database
from utils.router_utils import verify_canvas_ownership, format_sse_event
from utils.logger import logger
from schemas.agent_schemas import AgentTaskRequest, AgentTaskResponse
from services.agents import CanvasAgent


router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    responses={404: {"description": "Not found"}},
)


@router.post("/execute", response_model=AgentTaskResponse)
async def execute_agent_task(
    request: AgentTaskRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> AgentTaskResponse:
    """
    Execute an agent task on a canvas (synchronous).

    This endpoint runs the agent and returns the final response.
    Use this for simple operations where you don't need progress updates.

    Args:
        request: Contains canvas_id, query, and optional thread_id
        current_user: Authenticated user from JWT
        db: Database instance

    Returns:
        AgentTaskResponse with the agent's response message
    """
    try:
        # Verify canvas access
        await verify_canvas_ownership(db, request.canvas_id, current_user.user_id)

        # Create and run agent
        agent = CanvasAgent(db, request.canvas_id, current_user.user_id)
        response = await agent.run(request.query, request.thread_id)

        logger.info(
            f"Agent task completed for canvas {request.canvas_id} by user {current_user.user_id}"
        )

        return AgentTaskResponse(
            success=True,
            message=response,
            canvas_id=request.canvas_id,
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Agent task error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Agent task error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to execute agent task",
        )


@router.post("/execute-stream")
async def execute_agent_task_stream(
    request: AgentTaskRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> StreamingResponse:
    """
    Execute an agent task with SSE streaming.

    This endpoint streams progress updates as the agent works,
    including tool calls, tool results, and the final response.

    Event types:
    - started: Agent has started processing
    - tool_call: Agent is calling a tool (includes tool name)
    - tool_result: Tool execution completed (includes result)
    - response: Agent's final response message
    - completed: Task finished successfully
    - error: An error occurred

    Args:
        request: Contains canvas_id, query, and optional thread_id
        current_user: Authenticated user from JWT
        db: Database instance

    Returns:
        SSE stream of agent events
    """
    # Verify canvas ownership before streaming
    await verify_canvas_ownership(db, request.canvas_id, current_user.user_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # Send started event
            yield format_sse_event("started", {"message": "Agent started processing"})

            # Create agent
            agent = CanvasAgent(db, request.canvas_id, current_user.user_id)

            # Stream agent execution
            final_response = None
            async for event in agent.run_stream(request.query, request.thread_id):
                event_type = event.get("event", "unknown")

                if event_type == "tool_call":
                    yield format_sse_event(
                        "tool_call",
                        {
                            "tool_name": event.get("tool_name"),
                            "tool_args": event.get("tool_args", {}),
                        },
                    )

                elif event_type == "tool_result":
                    yield format_sse_event(
                        "tool_result",
                        {
                            "tool_name": event.get("tool_name"),
                            "result": event.get("result"),
                        },
                    )

                elif event_type == "response":
                    final_response = event.get("content", "")
                    yield format_sse_event(
                        "response",
                        {"message": final_response},
                    )

                elif event_type == "error":
                    yield format_sse_event(
                        "error",
                        {"error": event.get("error", "Unknown error")},
                    )
                    return

            # Send completed event
            yield format_sse_event(
                "completed",
                {
                    "message": final_response or "Task completed",
                    "canvas_id": request.canvas_id,
                },
            )

            logger.info(
                f"Agent stream completed for canvas {request.canvas_id} by user {current_user.user_id}"
            )

        except Exception as e:
            logger.error(f"Agent stream error: {e}")
            yield format_sse_event("error", {"error": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.get("/info")
async def get_agent_info(
    _current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Get information about the canvas agent capabilities.

    Returns a list of available tools and their descriptions.
    """
    return {
        "name": "Canvas Agent",
        "description": "AI agent for manipulating canvas content",
        "tools": [
            {
                "name": "get_canvas_text",
                "description": "Read all text content from the canvas",
            },
            {
                "name": "search_canvas",
                "description": "Search for specific text in the canvas",
            },
            {
                "name": "replace_text",
                "description": "Find and replace text throughout the canvas",
            },
            {
                "name": "add_section",
                "description": "Add a new section with heading and paragraphs",
            },
            {
                "name": "add_bullet_list",
                "description": "Add a bullet point list",
            },
            {
                "name": "add_task_list",
                "description": "Add a task list with checkboxes",
            },
            {
                "name": "add_code_block",
                "description": "Add a code block with syntax highlighting",
            },
        ],
        "example_queries": [
            "Read the canvas content",
            "Replace all 'API' with 'Service'",
            "Add a conclusion section",
            "Create a task list with: Review, Edit, Publish",
            "Add a Python code example",
        ],
    }
