import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
APP_API_KEY: str = os.getenv("APP_API_KEY", "")
CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

MAX_IMAGE_SIZE_MB: int = int(os.getenv("MAX_IMAGE_SIZE_MB", "5"))
MAX_IMAGE_DIMENSION: int = int(os.getenv("MAX_IMAGE_DIMENSION", "1568"))

RATE_LIMIT_PER_MINUTE: str = os.getenv("RATE_LIMIT_PER_MINUTE", "5")
RATE_LIMIT_PER_HOUR: str = os.getenv("RATE_LIMIT_PER_HOUR", "30")
RATE_LIMIT_PER_DAY: str = os.getenv("RATE_LIMIT_PER_DAY", "100")

ALLOWED_MIME_TYPES: set = {"image/jpeg", "image/png", "image/webp", "image/gif"}
