"""
Centralized logging for RyteAI backend.

Usage:
    from utils.logger import logger
    
    logger.info("This is an info message")
    logger.error("This is an error message")
"""

import logging

# Configure logging once
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Create a single logger instance to be imported everywhere
logger = logging.getLogger("ryteai")
