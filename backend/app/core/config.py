"""
Core Server Configuration for FastAPI.
"""

import os
from pathlib import Path
from typing import List
from pydantic import BaseModel, Field

# Load .env if present
try:
    from dotenv import load_dotenv
    # Search root and backend dirs for .env
    root_env = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    backend_env = Path(__file__).resolve().parent.parent.parent / ".env"
    if root_env.exists():
        load_dotenv(root_env)
    if backend_env.exists():
        load_dotenv(backend_env)
except ImportError:
    pass


class ServerSettings(BaseModel):
    """FastAPI server and CORS settings."""
    app_name: str = "IBPS — Integrated Block Planning System"
    app_version: str = "1.0.0"
    api_prefix: str = "/api"
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    debug: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")
    
    # Configurable CORS origins
    cors_origins: List[str] = Field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000"
            ).split(",")
            if origin.strip()
        ]
    )


server_settings = ServerSettings()

