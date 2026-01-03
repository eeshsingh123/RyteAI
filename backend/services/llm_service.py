import logging
from typing import Optional

from google import genai
from google.genai import types

from config import settings

logger = logging.getLogger(__name__)


class LLMService:
    """Service for handling all LLM API calls using Google Gemini with native async support."""

    _instance: Optional["LLMService"] = None
    _initialized: bool = False

    def __new__(cls) -> "LLMService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self._initialize()
            LLMService._initialized = True

    def _initialize(self):
        """Initialize the Gemini API client."""
        if not settings.gemini_api_key:
            logger.warning("GEMINI_API_KEY not set. LLM features will not work.")
            self.client = None
            return

        try:
            self.client = genai.Client(api_key=settings.gemini_api_key)
            self.model_name = "gemini-3-flash-preview"
            logger.info("Gemini API initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Gemini API: {e}")
            self.client = None

    def _ensure_client(self):
        """Check if client is available, raise if not."""
        if not self.client:
            raise ValueError("LLM service not initialized. Please set GEMINI_API_KEY.")

    async def execute_instruction(self, instruction: str, canvas_context: dict) -> str:
        """
        Execute an AI instruction with canvas context using native async.

        Args:
            instruction: The user's instruction
            canvas_context: Context from the canvas (title, content, etc.)

        Returns:
            The AI-generated response
        """
        self._ensure_client()
        prompt = self._build_instruction_prompt(instruction, canvas_context)

        try:
            # Use native async API via client.aio
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=2048,
                ),
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Error executing instruction: {e}")
            raise

    async def improve_text(
        self, selected_text: str, action: str, canvas_context: dict
    ) -> str:
        """
        Improve selected text based on the action using native async.

        Args:
            selected_text: The text selected by the user
            action: The improvement action (improve, rephrase, summarize, expand, simplify)
            canvas_context: Context from the canvas

        Returns:
            The improved text
        """
        self._ensure_client()
        prompt = self._build_improve_prompt(selected_text, action, canvas_context)

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=2048,
                ),
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Error improving text: {e}")
            raise

    def _build_instruction_prompt(self, instruction: str, canvas_context: dict) -> str:
        """Build the prompt for instruction execution."""
        context_parts = []
        if canvas_context.get("title"):
            context_parts.append(f"Document Title: {canvas_context['title']}")
        if canvas_context.get("description"):
            context_parts.append(f"Description: {canvas_context['description']}")

        context_text = "\n".join(context_parts) + "\n" if context_parts else ""

        return f"""You are an AI writing assistant helping with a document. Your response will be inserted directly into a rich text editor that supports markdown formatting.

{context_text}User's instruction: {instruction}

IMPORTANT FORMATTING RULES:
- Use proper markdown formatting (headers with #, bold with **, italic with *, lists with - or 1., etc.)
- DO NOT wrap your entire response in markdown code blocks (```). Only use code blocks for actual code snippets.
- Start your response directly with the content - no "Here's..." or "Sure..." preambles.
- Use appropriate heading levels (# for main headings, ## for subheadings, etc.)
- Format lists properly with proper indentation
- Keep paragraphs well-structured with blank lines between them

Respond directly with the content requested."""

    def _build_improve_prompt(
        self, selected_text: str, action: str, canvas_context: dict
    ) -> str:
        """Build the prompt for text improvement."""
        action_prompts = {
            "improve": "Improve the following text to make it clearer, more engaging, and better written. Fix any grammar or spelling issues.",
            "rephrase": "Rephrase the following text in a different way while keeping the same meaning.",
            "summarize": "Summarize the following text concisely while keeping the key points.",
            "expand": "Expand the following text with more detail and depth while maintaining the original message.",
            "simplify": "Simplify the following text to make it easier to understand. Use simpler words and shorter sentences.",
            "formal": "Rewrite the following text in a more formal, professional tone.",
            "casual": "Rewrite the following text in a more casual, conversational tone.",
        }

        action_prompt = action_prompts.get(action, action_prompts["improve"])
        title_context = (
            f"(This is from a document titled: {canvas_context['title']})\n\n"
            if canvas_context.get("title")
            else ""
        )

        return f"""{title_context}{action_prompt}

Text to process:
"{selected_text}"

IMPORTANT: 
- Respond with ONLY the improved text, no explanations or commentary.
- Preserve any existing markdown formatting in the text.
- If adding formatting, use proper markdown (**, *, -, #, etc.).
- DO NOT wrap the response in markdown code blocks (```).
- Do not add quotation marks around your response."""


# Global instance
llm_service = LLMService()
