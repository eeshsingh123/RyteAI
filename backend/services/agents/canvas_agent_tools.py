from typing import Any
from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from utils.prosemirror_parser import (
    ProseMirrorParser,
    create_paragraph,
    create_heading,
    create_bullet_list,
    create_task_list,
    create_code_block,
)
from utils.logger import logger


# ============================================================================
# Tool Input/Output Schemas
# ============================================================================


class GetCanvasTextInput(BaseModel):
    """Input schema for get_canvas_text tool."""

    # No input fields needed for this tool


class SearchCanvasInput(BaseModel):
    """Input schema for search_canvas tool."""

    query: str = Field(description="The text to search for in the canvas")
    case_sensitive: bool = Field(
        default=False, description="Whether the search should be case-sensitive"
    )


class ReplaceTextInput(BaseModel):
    """Input schema for replace_text tool."""

    old_text: str = Field(description="The text to find and replace")
    new_text: str = Field(description="The text to replace with")
    case_sensitive: bool = Field(
        default=False, description="Whether the replacement should be case-sensitive"
    )


class AddSectionInput(BaseModel):
    """Input schema for add_section tool."""

    heading: str = Field(description="The heading text for the new section")
    paragraphs: list[str] = Field(
        description="List of paragraph texts to add under the heading"
    )
    position: str = Field(
        default="end",
        description="Where to add the section: 'start' or 'end' of the document",
    )
    heading_level: int = Field(
        default=2, description="Heading level (1-6), where 1 is the largest"
    )


class AddBulletListInput(BaseModel):
    """Input schema for add_bullet_list tool."""

    items: list[str] = Field(description="List of bullet point items to add")
    position: str = Field(
        default="end",
        description="Where to add the list: 'start' or 'end' of the document",
    )


class AddTaskListInput(BaseModel):
    """Input schema for add_task_list tool."""

    tasks: list[str] = Field(description="List of task descriptions to add")
    position: str = Field(
        default="end",
        description="Where to add the task list: 'start' or 'end' of the document",
    )


class AddCodeBlockInput(BaseModel):
    """Input schema for add_code_block tool."""

    code: str = Field(description="The code content to add")
    language: str = Field(
        default="",
        description="Programming language for syntax highlighting (e.g., 'python', 'javascript', 'typescript')",
    )
    position: str = Field(
        default="end",
        description="Where to add the code block: 'start' or 'end' of the document",
    )


class ToolResult(BaseModel):
    """Standard result schema for all tools."""

    success: bool = Field(description="Whether the operation succeeded")
    message: str = Field(description="Human-readable result message")
    data: dict[str, Any] = Field(
        default_factory=dict, description="Additional result data"
    )


# ============================================================================
# Canvas Tools Class
# ============================================================================


class CanvasTools:
    """
    Collection of tools for canvas manipulation.

    Provides methods that can be called by the LangGraph agent to read,
    search, and modify canvas content. Each method is designed to be
    atomic and handles its own database operations.

    Args:
        db: MongoDB database instance
        canvas_id: ID of the canvas to operate on
        user_id: ID of the user (for ownership verification)
    """

    # Threshold for switching to chunked processing
    LARGE_CANVAS_THRESHOLD = 500
    CHUNK_SIZE = 100

    def __init__(self, db: AsyncIOMotorDatabase, canvas_id: str, user_id: str):
        self.db = db
        self.canvas_id = canvas_id
        self.user_id = user_id
        self._canvas_cache: dict[str, Any] | None = None

    async def _get_canvas(self) -> dict[str, Any]:
        """
        Fetch and cache the canvas document.

        Returns:
            Canvas document from MongoDB

        Raises:
            ValueError: If canvas_id is invalid or canvas not found
        """
        if self._canvas_cache is not None:
            return self._canvas_cache

        if not ObjectId.is_valid(self.canvas_id):
            raise ValueError(f"Invalid canvas ID: {self.canvas_id}")

        canvas = await self.db.canvas.find_one(
            {"_id": ObjectId(self.canvas_id), "user_id": self.user_id}
        )

        if not canvas:
            raise ValueError("Canvas not found or access denied")

        self._canvas_cache = canvas
        return canvas

    async def _save_canvas(self, content: dict[str, Any]) -> None:
        """
        Save modified canvas content to database.

        Args:
            content: The modified ProseMirror content

        Raises:
            ValueError: If save operation fails
        """
        result = await self.db.canvas.update_one(
            {"_id": ObjectId(self.canvas_id), "user_id": self.user_id},
            {"$set": {"content": content, "updated_at": datetime.now(timezone.utc)}},
        )

        if result.matched_count == 0:
            raise ValueError("Failed to save canvas - document not found")

        # Invalidate cache after save
        self._canvas_cache = None
        logger.info(f"Canvas {self.canvas_id} saved successfully")

    def _get_content_nodes(self, content: dict[str, Any]) -> list[dict[str, Any]]:
        """Get the content nodes list, ensuring it exists."""
        if "content" not in content or not isinstance(content["content"], list):
            content["content"] = []
        return content["content"]

    # ========================================================================
    # Tool: Get Canvas Text
    # ========================================================================

    async def get_canvas_text(self) -> ToolResult:
        """
        Read all text content from the canvas.

        Use this tool FIRST to understand what content is currently on the canvas
        before making any modifications. This gives you context about the document
        structure and existing content.

        Returns:
            ToolResult with the plain text content of the entire canvas.
            The text includes all paragraphs, headings, lists, and code blocks.

        Example usage:
            - "What's on the canvas?" -> Use this to read content
            - Before replacing text -> Use this to verify text exists
            - To summarize the document -> Use this to get full content
        """
        try:
            canvas = await self._get_canvas()
            content = canvas.get("content", {"type": "doc", "content": []})

            parser = ProseMirrorParser(content)
            text = parser.extract_text()

            char_count = len(text)
            logger.info(
                f"Extracted {char_count} characters from canvas {self.canvas_id}"
            )

            return ToolResult(
                success=True,
                message=f"Canvas content extracted ({char_count} characters)",
                data={"text": text, "character_count": char_count},
            )
        except Exception as e:
            logger.error(f"Error reading canvas: {e}")
            return ToolResult(success=False, message=f"Failed to read canvas: {str(e)}")

    # ========================================================================
    # Tool: Search Canvas
    # ========================================================================

    async def search_canvas(self, input_data: SearchCanvasInput) -> ToolResult:
        """
        Search for specific text within the canvas.

        Use this tool to find occurrences of specific text before performing
        replacements. This helps verify the text exists and shows how many
        matches will be affected.

        Args:
            input_data: Contains 'query' (text to search) and 'case_sensitive' flag

        Returns:
            ToolResult with match count and locations where text was found.

        Example usage:
            - "How many times does 'API' appear?" -> Search for "API"
            - "Find all mentions of the word 'error'" -> Search for "error"
            - Before replacing -> Search first to confirm matches exist
        """
        try:
            canvas = await self._get_canvas()
            content = canvas.get("content", {"type": "doc", "content": []})

            parser = ProseMirrorParser(content)
            matches = parser.find_text(input_data.query, input_data.case_sensitive)

            match_count = len(matches)
            locations = [
                {"text": m["text"], "path": m["path"]} for m in matches[:10]
            ]  # Limit to first 10 for readability

            logger.info(
                f"Found {match_count} matches for '{input_data.query}' in canvas {self.canvas_id}"
            )

            return ToolResult(
                success=True,
                message=f"Found {match_count} occurrence(s) of '{input_data.query}'",
                data={
                    "query": input_data.query,
                    "match_count": match_count,
                    "locations": locations,
                    "truncated": match_count > 10,
                },
            )
        except Exception as e:
            logger.error(f"Error searching canvas: {e}")
            return ToolResult(
                success=False, message=f"Failed to search canvas: {str(e)}"
            )

    # ========================================================================
    # Tool: Replace Text
    # ========================================================================

    async def replace_text(self, input_data: ReplaceTextInput) -> ToolResult:
        """
        Find and replace text throughout the canvas.

        Use this tool when the user wants to change specific words or phrases
        across the entire document. For large canvases (500+ nodes), this
        automatically uses chunked processing to prevent timeouts.

        Args:
            input_data: Contains 'old_text', 'new_text', and 'case_sensitive' flag

        Returns:
            ToolResult with the number of replacements made.

        Example usage:
            - "Replace all 'API' with 'Service'" -> replace_text("API", "Service")
            - "Change 'color' to 'colour'" -> replace_text("color", "colour")
            - "Update version from 1.0 to 2.0" -> replace_text("1.0", "2.0")

        Note: This modifies the canvas and saves changes automatically.
        """
        try:
            canvas = await self._get_canvas()
            content = canvas.get("content", {"type": "doc", "content": []})

            nodes = content.get("content", [])
            node_count = len(nodes)

            # Use chunked processing for large canvases
            if node_count > self.LARGE_CANVAS_THRESHOLD:
                return await self._replace_text_chunked(content, input_data)

            # Standard processing for smaller canvases
            parser = ProseMirrorParser(content)
            count = parser.replace_text(
                input_data.old_text, input_data.new_text, input_data.case_sensitive
            )

            if count > 0:
                modified_content = parser.get_modified_content()
                await self._save_canvas(modified_content)

            logger.info(
                f"Replaced {count} occurrences of '{input_data.old_text}' with '{input_data.new_text}'"
            )

            return ToolResult(
                success=True,
                message=f"Replaced {count} occurrence(s) of '{input_data.old_text}' with '{input_data.new_text}'",
                data={
                    "replacements_made": count,
                    "old_text": input_data.old_text,
                    "new_text": input_data.new_text,
                },
            )
        except Exception as e:
            logger.error(f"Error replacing text: {e}")
            return ToolResult(
                success=False, message=f"Failed to replace text: {str(e)}"
            )

    async def _replace_text_chunked(
        self, content: dict[str, Any], input_data: ReplaceTextInput
    ) -> ToolResult:
        """
        Replace text in large canvases using chunked processing.

        Processes the canvas in chunks to prevent memory issues and timeouts.
        """
        nodes = content.get("content", [])
        total_nodes = len(nodes)
        total_replacements = 0
        chunks_processed = 0

        for i in range(0, total_nodes, self.CHUNK_SIZE):
            chunk_end = min(i + self.CHUNK_SIZE, total_nodes)
            chunk_nodes = nodes[i:chunk_end]

            # Create temporary content with just this chunk
            temp_content = {"type": "doc", "content": chunk_nodes}
            parser = ProseMirrorParser(temp_content)

            # Replace in chunk
            count = parser.replace_text(
                input_data.old_text, input_data.new_text, input_data.case_sensitive
            )
            total_replacements += count

            # Update original nodes
            modified_chunk = parser.get_modified_content()["content"]
            nodes[i:chunk_end] = modified_chunk
            chunks_processed += 1

            logger.debug(
                f"Chunk {chunks_processed}: Processed {chunk_end}/{total_nodes} nodes"
            )

        # Save if any replacements were made
        if total_replacements > 0:
            content["content"] = nodes
            await self._save_canvas(content)

        return ToolResult(
            success=True,
            message=f"Replaced {total_replacements} occurrence(s) in large canvas ({total_nodes} nodes, {chunks_processed} chunks)",
            data={
                "replacements_made": total_replacements,
                "total_nodes": total_nodes,
                "chunks_processed": chunks_processed,
            },
        )

    # ========================================================================
    # Tool: Add Section
    # ========================================================================

    async def add_section(self, input_data: AddSectionInput) -> ToolResult:
        """
        Add a new section with a heading and paragraphs to the canvas.

        Use this tool when the user wants to add new structured content
        with a heading followed by one or more paragraphs.

        Args:
            input_data: Contains 'heading', 'paragraphs' list, 'position', and 'heading_level'

        Returns:
            ToolResult confirming the section was added.

        Example usage:
            - "Add a conclusion section" -> add_section("Conclusion", ["Summary paragraph..."])
            - "Add an introduction at the start" -> add_section("Introduction", [...], position="start")
            - "Add a section about features" -> add_section("Features", ["Feature 1...", "Feature 2..."])

        Note: This modifies the canvas and saves changes automatically.
        """
        try:
            canvas = await self._get_canvas()
            content = canvas.get("content", {"type": "doc", "content": []})
            nodes = self._get_content_nodes(content)

            # Validate heading level
            level = max(1, min(6, input_data.heading_level))

            # Build new section nodes
            new_nodes = [create_heading(input_data.heading, level)]
            for para_text in input_data.paragraphs:
                new_nodes.append(create_paragraph(para_text))

            # Insert at specified position
            if input_data.position == "start":
                content["content"] = new_nodes + nodes
            else:
                content["content"] = nodes + new_nodes

            await self._save_canvas(content)

            logger.info(
                f"Added section '{input_data.heading}' to canvas {self.canvas_id}"
            )

            return ToolResult(
                success=True,
                message=f"Added section '{input_data.heading}' with {len(input_data.paragraphs)} paragraph(s) at {input_data.position}",
                data={
                    "heading": input_data.heading,
                    "paragraph_count": len(input_data.paragraphs),
                    "position": input_data.position,
                },
            )
        except Exception as e:
            logger.error(f"Error adding section: {e}")
            return ToolResult(success=False, message=f"Failed to add section: {str(e)}")

    # ========================================================================
    # Tool: Add Bullet List
    # ========================================================================

    async def add_bullet_list(self, input_data: AddBulletListInput) -> ToolResult:
        """
        Add a bullet point list to the canvas.

        Use this tool when the user wants to add a list of items with bullet points.
        Each item will be formatted as a separate bullet point.

        Args:
            input_data: Contains 'items' list and 'position'

        Returns:
            ToolResult confirming the bullet list was added.

        Example usage:
            - "Add a list of features" -> add_bullet_list(["Feature 1", "Feature 2", "Feature 3"])
            - "Add bullet points for the requirements" -> add_bullet_list(["Req 1", "Req 2"])
            - "List the following items" -> add_bullet_list([...])

        Note: This modifies the canvas and saves changes automatically.
        """
        try:
            canvas = await self._get_canvas()
            content = canvas.get("content", {"type": "doc", "content": []})
            nodes = self._get_content_nodes(content)

            # Create bullet list node
            bullet_list_node = create_bullet_list(input_data.items)

            # Insert at specified position
            if input_data.position == "start":
                content["content"] = [bullet_list_node] + nodes
            else:
                content["content"] = nodes + [bullet_list_node]

            await self._save_canvas(content)

            logger.info(
                f"Added bullet list with {len(input_data.items)} items to canvas {self.canvas_id}"
            )

            return ToolResult(
                success=True,
                message=f"Added bullet list with {len(input_data.items)} item(s) at {input_data.position}",
                data={
                    "item_count": len(input_data.items),
                    "position": input_data.position,
                },
            )
        except Exception as e:
            logger.error(f"Error adding bullet list: {e}")
            return ToolResult(
                success=False, message=f"Failed to add bullet list: {str(e)}"
            )

    # ========================================================================
    # Tool: Add Task List
    # ========================================================================

    async def add_task_list(self, input_data: AddTaskListInput) -> ToolResult:
        """
        Add a task list with checkboxes to the canvas.

        Use this tool when the user wants to add a to-do list or checklist.
        Each task will have a checkbox that can be checked/unchecked.

        Args:
            input_data: Contains 'tasks' list and 'position'

        Returns:
            ToolResult confirming the task list was added.

        Example usage:
            - "Add a to-do list" -> add_task_list(["Task 1", "Task 2", "Task 3"])
            - "Create a checklist for deployment" -> add_task_list(["Build", "Test", "Deploy"])
            - "Add tasks: Review, Edit, Publish" -> add_task_list(["Review", "Edit", "Publish"])

        Note: All tasks are added unchecked. This modifies the canvas and saves automatically.
        """
        try:
            canvas = await self._get_canvas()
            content = canvas.get("content", {"type": "doc", "content": []})
            nodes = self._get_content_nodes(content)

            # Create task list with unchecked items
            task_items = [{"text": task, "checked": False} for task in input_data.tasks]
            task_list_node = create_task_list(task_items)

            # Insert at specified position
            if input_data.position == "start":
                content["content"] = [task_list_node] + nodes
            else:
                content["content"] = nodes + [task_list_node]

            await self._save_canvas(content)

            logger.info(
                f"Added task list with {len(input_data.tasks)} tasks to canvas {self.canvas_id}"
            )

            return ToolResult(
                success=True,
                message=f"Added task list with {len(input_data.tasks)} task(s) at {input_data.position}",
                data={
                    "task_count": len(input_data.tasks),
                    "position": input_data.position,
                },
            )
        except Exception as e:
            logger.error(f"Error adding task list: {e}")
            return ToolResult(
                success=False, message=f"Failed to add task list: {str(e)}"
            )

    # ========================================================================
    # Tool: Add Code Block
    # ========================================================================

    async def add_code_block(self, input_data: AddCodeBlockInput) -> ToolResult:
        """
        Add a code block with optional syntax highlighting to the canvas.

        Use this tool when the user wants to add code snippets, examples,
        or any preformatted text that should preserve formatting.

        Args:
            input_data: Contains 'code', 'language', and 'position'

        Returns:
            ToolResult confirming the code block was added.

        Example usage:
            - "Add a Python code example" -> add_code_block("print('hello')", language="python")
            - "Insert this JavaScript snippet" -> add_code_block("const x = 1;", language="javascript")
            - "Add a code block" -> add_code_block("code here")

        Supported languages: python, javascript, typescript, java, go, rust,
        html, css, sql, bash, json, yaml, markdown, and many more.

        Note: This modifies the canvas and saves changes automatically.
        """
        try:
            canvas = await self._get_canvas()
            content = canvas.get("content", {"type": "doc", "content": []})
            nodes = self._get_content_nodes(content)

            # Create code block node
            code_block_node = create_code_block(
                input_data.code, input_data.language or None
            )

            # Insert at specified position
            if input_data.position == "start":
                content["content"] = [code_block_node] + nodes
            else:
                content["content"] = nodes + [code_block_node]

            await self._save_canvas(content)

            lang_info = f" ({input_data.language})" if input_data.language else ""
            logger.info(f"Added code block{lang_info} to canvas {self.canvas_id}")

            return ToolResult(
                success=True,
                message=f"Added code block{lang_info} at {input_data.position}",
                data={
                    "language": input_data.language,
                    "position": input_data.position,
                    "code_length": len(input_data.code),
                },
            )
        except Exception as e:
            logger.error(f"Error adding code block: {e}")
            return ToolResult(
                success=False, message=f"Failed to add code block: {str(e)}"
            )
