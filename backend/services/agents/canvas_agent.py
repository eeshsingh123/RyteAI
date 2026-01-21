from typing import Literal, Any, Annotated
import operator

from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import tool
from motor.motor_asyncio import AsyncIOMotorDatabase

from config import settings
from utils.logger import logger
from .canvas_agent_tools import (
    CanvasTools,
    SearchCanvasInput,
    ReplaceTextInput,
    AddSectionInput,
    AddBulletListInput,
    AddTaskListInput,
    AddCodeBlockInput,
)


# ============================================================================
# State Definition (Pydantic)
# ============================================================================


class AgentState(BaseModel):
    """
    State that flows through the LangGraph agent.

    Uses Pydantic for validation and serialization.
    Messages are accumulated as the agent processes requests.

    Note: The messages field uses Annotated with operator.add to ensure
    messages are accumulated (appended) rather than replaced when nodes
    return updates.
    """

    messages: Annotated[list[BaseMessage], operator.add] = Field(default_factory=list)
    canvas_id: str = Field(default="")
    user_id: str = Field(default="")
    tool_calls_made: int = Field(default=0)
    last_tool_result: str | None = Field(default=None)

    class Config:
        arbitrary_types_allowed = True


# ============================================================================
# System Prompt
# ============================================================================

SYSTEM_PROMPT = """You are a helpful canvas editing assistant for RyteAI.

You can help users modify their canvas content using these tools:

## Available Tools:

1. **get_canvas_text** - Read the current canvas content
   - Use this FIRST to understand what's on the canvas before making changes
   - No parameters needed

2. **search_canvas** - Find specific text in the canvas
   - Parameters: query (text to find), case_sensitive (optional, default false)
   - Use before replacing to verify text exists

3. **replace_text** - Find and replace text throughout the canvas
   - Parameters: old_text, new_text, case_sensitive (optional)
   - Replaces ALL occurrences

4. **add_section** - Add a new section with heading and paragraphs
   - Parameters: heading, paragraphs (list of strings), position (start/end), heading_level (1-6)

5. **add_bullet_list** - Add a bullet point list
   - Parameters: items (list of strings), position (start/end)

6. **add_task_list** - Add a task list with checkboxes
   - Parameters: tasks (list of task strings), position (start/end)

7. **add_code_block** - Add a code block with syntax highlighting
   - Parameters: code, language (python/javascript/etc), position (start/end)

## Guidelines:

1. **Read First**: Always use get_canvas_text first if you need to understand the content
2. **Verify Before Replacing**: Use search_canvas before replace_text to confirm matches exist
3. **Be Precise**: Use exact text for replacements
4. **Confirm Actions**: Clearly explain what changes you made
5. **Ask for Clarification**: If the user's request is unclear, ask for details

## Response Style:

- Be concise and helpful
- After making changes, summarize what you did
- If a tool fails, explain the error and suggest alternatives
- Don't make changes the user didn't ask for"""


# ============================================================================
# Canvas Agent Class
# ============================================================================


class CanvasAgent:
    """
    LangGraph agent for canvas manipulation.

    Creates a stateful graph that can:
    - Process user requests about canvas content
    - Call tools to read, search, and modify the canvas
    - Maintain conversation history
    - Support streaming responses

    Args:
        db: MongoDB database instance
        canvas_id: ID of the canvas to operate on
        user_id: ID of the requesting user

    Usage:
        agent = CanvasAgent(db, canvas_id, user_id)
        response = await agent.run("Replace all API with Service")
    """

    MAX_TOOL_CALLS = 10  # Prevent infinite loops

    def __init__(self, db: AsyncIOMotorDatabase, canvas_id: str, user_id: str):
        self.db = db
        self.canvas_id = canvas_id
        self.user_id = user_id

        # Initialize canvas tools
        self.canvas_tools = CanvasTools(db, canvas_id, user_id)

        # Create LangChain tools from canvas tools
        self.tools = self._create_tools()

        # Initialize LLM with tools bound
        self.llm = self._create_llm()

        # Build and compile the graph
        self.graph = self._build_graph()

    def _create_llm(self) -> ChatGoogleGenerativeAI:
        """Create the Gemini LLM with tools bound."""
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY not configured")

        llm = ChatGoogleGenerativeAI(
            model="gemini-3-flash-preview",
            google_api_key=settings.gemini_api_key,
            temperature=0,
            convert_system_message_to_human=True,
        )

        # Bind tools to LLM
        return llm.bind_tools(self.tools)

    def _create_tools(self) -> list:
        """
        Create LangChain tool functions that wrap our canvas tools.

        Each tool is decorated with @tool and calls the corresponding
        async method on CanvasTools.
        """
        canvas_tools = self.canvas_tools

        @tool
        async def get_canvas_text() -> str:
            """
            Read all text content from the canvas.
            Use this FIRST to understand what's currently on the canvas before making any modifications.
            Returns the plain text content of the entire canvas.
            """
            result = await canvas_tools.get_canvas_text()
            if result.success:
                return result.data.get("text", "Canvas is empty")
            return f"Error: {result.message}"

        @tool
        async def search_canvas(query: str, case_sensitive: bool = False) -> str:
            """
            Search for specific text in the canvas.
            Use this to find occurrences of text before replacing.
            Returns the number of matches found and their locations.

            Args:
                query: The text to search for
                case_sensitive: Whether search should be case-sensitive (default: false)
            """
            input_data = SearchCanvasInput(query=query, case_sensitive=case_sensitive)
            result = await canvas_tools.search_canvas(input_data)
            return result.message

        @tool
        async def replace_text(
            old_text: str, new_text: str, case_sensitive: bool = False
        ) -> str:
            """
            Find and replace text throughout the canvas.
            Replaces ALL occurrences of old_text with new_text.

            Args:
                old_text: The text to find and replace
                new_text: The text to replace it with
                case_sensitive: Whether replacement should be case-sensitive (default: false)
            """
            input_data = ReplaceTextInput(
                old_text=old_text, new_text=new_text, case_sensitive=case_sensitive
            )
            result = await canvas_tools.replace_text(input_data)
            return result.message

        @tool
        async def add_section(
            heading: str,
            paragraphs: list[str],
            position: str = "end",
            heading_level: int = 2,
        ) -> str:
            """
            Add a new section with a heading and paragraphs to the canvas.

            Args:
                heading: The heading text for the section
                paragraphs: List of paragraph texts to add under the heading
                position: Where to add - 'start' or 'end' (default: end)
                heading_level: Heading size 1-6, where 1 is largest (default: 2)
            """
            input_data = AddSectionInput(
                heading=heading,
                paragraphs=paragraphs,
                position=position,
                heading_level=heading_level,
            )
            result = await canvas_tools.add_section(input_data)
            return result.message

        @tool
        async def add_bullet_list(items: list[str], position: str = "end") -> str:
            """
            Add a bullet point list to the canvas.

            Args:
                items: List of bullet point items
                position: Where to add - 'start' or 'end' (default: end)
            """
            input_data = AddBulletListInput(items=items, position=position)
            result = await canvas_tools.add_bullet_list(input_data)
            return result.message

        @tool
        async def add_task_list(tasks: list[str], position: str = "end") -> str:
            """
            Add a task list with checkboxes to the canvas.
            Each task will have an unchecked checkbox.

            Args:
                tasks: List of task descriptions
                position: Where to add - 'start' or 'end' (default: end)
            """
            input_data = AddTaskListInput(tasks=tasks, position=position)
            result = await canvas_tools.add_task_list(input_data)
            return result.message

        @tool
        async def add_code_block(
            code: str, language: str = "", position: str = "end"
        ) -> str:
            """
            Add a code block with optional syntax highlighting.

            Args:
                code: The code content to add
                language: Programming language (python, javascript, typescript, etc.)
                position: Where to add - 'start' or 'end' (default: end)
            """
            input_data = AddCodeBlockInput(
                code=code, language=language, position=position
            )
            result = await canvas_tools.add_code_block(input_data)
            return result.message

        return [
            get_canvas_text,
            search_canvas,
            replace_text,
            add_section,
            add_bullet_list,
            add_task_list,
            add_code_block,
        ]

    def _build_graph(self) -> StateGraph:
        """
        Build the LangGraph workflow.

        Graph structure:
            START -> agent -> should_continue? -> tools -> agent (loop)
                                               -> END (if no more tools)
        """
        # Create graph with our state schema
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", self._tool_node)

        # Set entry point
        workflow.set_entry_point("agent")

        # Add conditional edge from agent
        workflow.add_conditional_edges(
            "agent",
            self._should_continue,
            {"continue": "tools", "end": END},
        )

        # Tools always loop back to agent
        workflow.add_edge("tools", "agent")

        # Compile with in-memory checkpointer for persistence
        checkpointer = MemorySaver()
        return workflow.compile(checkpointer=checkpointer)

    async def _agent_node(self, state: AgentState) -> dict[str, Any]:
        """
        Agent node: LLM decides what to do next.

        Processes the current messages and either:
        - Calls a tool (returns AIMessage with tool_calls)
        - Responds to user (returns AIMessage with content)
        """
        messages = list(state.messages)

        # Add system message if this is the first call
        if not any(isinstance(m, SystemMessage) for m in messages):
            messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages

        # Call LLM
        try:
            response = await self.llm.ainvoke(messages)
            logger.info(f"Agent response: {response}")
            return {"messages": [response]}
        except Exception as e:
            logger.error(f"Agent node error: {e}")
            error_response = AIMessage(content=f"I encountered an error: {str(e)}")
            return {"messages": [error_response]}

    async def _tool_node(self, state: AgentState) -> dict[str, Any]:
        """
        Tool node: Execute tool calls from the agent.

        Processes all tool calls in the last AIMessage and returns
        ToolMessages with results.
        """
        messages = state.messages
        last_message = messages[-1]

        if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
            return {"messages": []}

        tool_messages = []
        tools_by_name = {t.name: t for t in self.tools}

        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            logger.info(f"Executing tool: {tool_name} with args: {tool_args}")

            try:
                if tool_name in tools_by_name:
                    # Execute the tool
                    result = await tools_by_name[tool_name].ainvoke(tool_args)
                    tool_messages.append(
                        ToolMessage(
                            content=str(result),
                            name=tool_name,
                            tool_call_id=tool_call["id"],
                        )
                    )
                else:
                    tool_messages.append(
                        ToolMessage(
                            content=f"Error: Unknown tool '{tool_name}'",
                            name=tool_name,
                            tool_call_id=tool_call["id"],
                        )
                    )
            except Exception as e:
                logger.error(f"Tool execution error: {e}")
                tool_messages.append(
                    ToolMessage(
                        content=f"Error executing {tool_name}: {str(e)}",
                        name=tool_name,
                        tool_call_id=tool_call["id"],
                    )
                )

        new_tool_calls = state.tool_calls_made + len(tool_messages)
        return {
            "messages": tool_messages,
            "tool_calls_made": new_tool_calls,
            "last_tool_result": tool_messages[-1].content if tool_messages else None,
        }

    def _should_continue(self, state: AgentState) -> Literal["continue", "end"]:
        """
        Decide whether to continue to tools or end.

        Returns 'continue' if the last message has tool calls,
        'end' otherwise (agent should respond to user).
        """
        messages = state.messages
        if not messages:
            return "end"

        last_message = messages[-1]

        # Check for max tool calls to prevent infinite loops
        if state.tool_calls_made >= self.MAX_TOOL_CALLS:
            logger.warning(f"Max tool calls ({self.MAX_TOOL_CALLS}) reached")
            return "end"

        # If LLM made tool calls, continue to tool node
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "continue"

        return "end"

    async def run(self, user_message: str, thread_id: str | None = None) -> str:
        """
        Run the agent with a user message.

        Args:
            user_message: The user's request
            thread_id: Optional thread ID for conversation persistence

        Returns:
            The agent's final response text
        """
        # Create initial state
        initial_state = AgentState(
            messages=[HumanMessage(content=user_message)],
            canvas_id=self.canvas_id,
            user_id=self.user_id,
        )

        # Configure thread for persistence
        config = {
            "configurable": {"thread_id": thread_id or f"canvas_{self.canvas_id}"}
        }

        # Run the graph
        try:
            final_state = await self.graph.ainvoke(initial_state, config)

            # Extract final response
            messages = final_state.get("messages", [])
            if messages:
                last_message = messages[-1]
                if isinstance(last_message, AIMessage):
                    return last_message.content or "Task completed."

            return "Task completed."

        except Exception as e:
            logger.error(f"Agent run error: {e}")
            raise

    async def run_stream(self, user_message: str, thread_id: str | None = None):
        """
        Stream agent execution events.

        Yields events as the agent processes the request, useful for
        showing progress in the UI.

        Args:
            user_message: The user's request
            thread_id: Optional thread ID for persistence

        Yields:
            Dict with event type and data
        """
        initial_state = AgentState(
            messages=[HumanMessage(content=user_message)],
            canvas_id=self.canvas_id,
            user_id=self.user_id,
        )

        config = {
            "configurable": {"thread_id": thread_id or f"canvas_{self.canvas_id}"}
        }

        try:
            async for event in self.graph.astream(initial_state, config, stream_mode="values"):
                messages = event.get("messages", [])
                if messages:
                    last_message = messages[-1]

                    if isinstance(last_message, AIMessage):
                        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
                            for tool_call in last_message.tool_calls:
                                yield {
                                    "event": "tool_call",
                                    "tool_name": tool_call["name"],
                                    "tool_args": tool_call["args"],
                                }
                        elif last_message.content:
                            yield {
                                "event": "response",
                                "content": last_message.content,
                            }

                    elif isinstance(last_message, ToolMessage):
                        yield {
                            "event": "tool_result",
                            "tool_name": last_message.name,
                            "result": last_message.content,
                        }

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield {"event": "error", "error": str(e)}
