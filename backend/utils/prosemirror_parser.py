import re
from typing import List, Dict, Any

from utils.logger import logger


class ProseMirrorParser:
    """
    Parse and manipulate ProseMirror JSON content.

    Example usage:
        parser = ProseMirrorParser(canvas_content)
        text = parser.extract_text()
        parser.replace_text("old", "new")
        modified = parser.get_modified_content()
    """

    def __init__(self, content: Dict[str, Any]):
        """
        Initialize parser with ProseMirror JSON content.

        Args:
            content: ProseMirror document JSON (must have type: "doc")
        """
        if not isinstance(content, dict) or content.get("type") != "doc":
            raise ValueError(
                "Content must be a valid ProseMirror document with type='doc'"
            )

        self.content = content
        self.nodes: List[Dict[str, Any]] = []
        self._parse_nodes(content, path="0")

    def _parse_nodes(self, node: Dict[str, Any], path: str = "0"):
        """
        Recursively parse all nodes in the document tree.
        Builds an internal list of all nodes with their paths.

        Args:
            node: Current node to parse
            path: Dot-separated path to this node (e.g., "0.1.2")
        """
        if not isinstance(node, dict):
            return

        # Store node info
        self.nodes.append(
            {
                "path": path,
                "type": node.get("type"),
                "attrs": node.get("attrs", {}),
                "text": node.get("text", ""),
                "marks": node.get("marks", []),
                "node": node,  # Reference to actual node
            }
        )

        # Recurse into children
        if "content" in node and isinstance(node["content"], list):
            for i, child in enumerate(node["content"]):
                child_path = f"{path}.{i}"
                self._parse_nodes(child, child_path)

    def extract_text(self) -> str:
        """
        Extract all text from the document.

        Returns:
            Plain text content (no formatting)
        """
        texts = []
        for node_info in self.nodes:
            if node_info["text"]:
                texts.append(node_info["text"])
        return " ".join(texts)

    def extract_structure(self) -> List[Dict[str, Any]]:
        """
        Extract document structure (headings).

        Returns:
            List of heading nodes with their text and levels

        Example:
            [
                {'type': 'heading', 'level': 1, 'text': 'Title', 'path': '0.0'},
                {'type': 'heading', 'level': 2, 'text': 'Section', 'path': '0.2'}
            ]
        """
        structure = []
        for node_info in self.nodes:
            if node_info["type"] == "heading":
                heading_text = self._get_node_text(node_info["node"])
                structure.append(
                    {
                        "type": "heading",
                        "level": node_info["attrs"].get("level", 1),
                        "text": heading_text,
                        "path": node_info["path"],
                    }
                )
        return structure

    def _get_node_text(self, node: Dict[str, Any]) -> str:
        """
        Get all text from a node and its children.

        Args:
            node: Node to extract text from

        Returns:
            Combined text content
        """
        if "text" in node:
            return node["text"]

        texts = []
        if "content" in node and isinstance(node["content"], list):
            for child in node["content"]:
                texts.append(self._get_node_text(child))
        return "".join(texts)

    def find_text(
        self, search_text: str, case_sensitive: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Find all text nodes containing specific text.

        Args:
            search_text: Text to search for
            case_sensitive: Whether search should be case-sensitive

        Returns:
            List of matching nodes with their paths
        """
        pattern = search_text if case_sensitive else search_text.lower()
        results = []

        for node_info in self.nodes:
            if not node_info["text"]:
                continue

            node_text = node_info["text"]
            if not case_sensitive:
                node_text = node_text.lower()

            if pattern in node_text:
                results.append(
                    {
                        "path": node_info["path"],
                        "type": node_info["type"],
                        "text": node_info["text"],
                        "node": node_info["node"],
                    }
                )

        return results

    def replace_text(
        self, old_text: str, new_text: str, case_sensitive: bool = False
    ) -> int:
        """
        Replace all occurrences of text in the document.

        Args:
            old_text: Text to find
            new_text: Text to replace with
            case_sensitive: Whether replacement should be case-sensitive

        Returns:
            Number of replacements made
        """
        count = 0
        matching_nodes = self.find_text(old_text, case_sensitive)

        for match in matching_nodes:
            node = match["node"]
            if "text" in node:
                if case_sensitive:
                    node["text"] = node["text"].replace(old_text, new_text)
                else:
                    # Case-insensitive replacement
                    pattern = re.compile(re.escape(old_text), re.IGNORECASE)
                    node["text"] = pattern.sub(new_text, node["text"])
                count += 1

        logger.info(f"Replaced {count} occurrences of '{old_text}' with '{new_text}'")
        return count

    def get_modified_content(self) -> Dict[str, Any]:
        """
        Get the modified content after manipulations.

        Returns:
            Modified ProseMirror JSON
        """
        return self.content


# ProseMirror Builder Utility Functions
# Helper functions to create valid ProseMirror structures.


def create_paragraph(text: str, marks: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Create a paragraph node.

    Args:
        text: Paragraph text
        marks: Optional formatting marks (bold, italic, etc.)

    Returns:
        Paragraph node
    """
    text_node = {"type": "text", "text": text}
    if marks:
        text_node["marks"] = marks

    return {"type": "paragraph", "content": [text_node]}


def create_heading(text: str, level: int = 1) -> Dict[str, Any]:
    """
    Create a heading node.

    Args:
        text: Heading text
        level: Heading level (1-6)

    Returns:
        Heading node
    """
    if not 1 <= level <= 6:
        raise ValueError("Heading level must be between 1 and 6")

    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def create_bullet_list(items: List[str]) -> Dict[str, Any]:
    """
    Create a bullet list.

    Args:
        items: List of item texts

    Returns:
        Bullet list node
    """
    return {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": item}]}
                ],
            }
            for item in items
        ],
    }


def create_task_list(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create a task list with checkboxes.

    Args:
        items: List of dicts with 'text' and optional 'checked' keys
               Example: [{"text": "Task 1", "checked": False}]

    Returns:
        Task list node
    """
    return {
        "type": "taskList",
        "content": [
            {
                "type": "taskItem",
                "attrs": {"checked": item.get("checked", False)},
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": item["text"]}],
                    }
                ],
            }
            for item in items
        ],
    }


def create_code_block(code: str, language: str = None) -> Dict[str, Any]:
    """
    Create a code block.

    Args:
        code: Code content
        language: Programming language (optional)

    Returns:
        Code block node
    """
    node = {"type": "codeBlock", "content": [{"type": "text", "text": code}]}

    if language:
        node["attrs"] = {"language": language}

    return node
