"""
Integrations router for external service APIs (VOICEVOX, etc.)
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from typing import List, Optional
from pathlib import Path
import httpx
import logging
import tempfile
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("/voicevox/speakers")
async def get_voicevox_speakers(
    host: str = Query(default="http://localhost:50021", description="VOICEVOX host URL")
):
    """
    Fetch available speakers from VOICEVOX engine.
    Returns a flattened list of speakers with their styles.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{host.rstrip('/')}/speakers")
            response.raise_for_status()
            speakers_data = response.json()

            # Flatten speakers and styles into a simple list
            speakers = []
            for speaker in speakers_data:
                speaker_name = speaker.get("name", "Unknown")
                for style in speaker.get("styles", []):
                    speakers.append({
                        "id": style.get("id"),
                        "name": speaker_name,
                        "style": style.get("name", "Normal"),
                        "label": f"{speaker_name} ({style.get('name', 'Normal')})",
                    })

            return {"speakers": speakers}

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to VOICEVOX at {host}. Make sure VOICEVOX is running."
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"VOICEVOX API error: {e.response.text}"
        )
    except Exception as e:
        logger.error(f"Error fetching VOICEVOX speakers: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch speakers: {str(e)}"
        )


@router.get("/voicevox/health")
async def check_voicevox_health(
    host: str = Query(default="http://localhost:50021", description="VOICEVOX host URL")
):
    """Check if VOICEVOX engine is running and accessible."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{host.rstrip('/')}/version")
            response.raise_for_status()
            version = response.text.strip('"')
            return {"status": "healthy", "version": version, "host": host}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e), "host": host}


@router.get("/audio/{filename}")
async def serve_audio(filename: str):
    """
    Serve generated audio files.
    Audio files are stored in the system temp directory with prefix 'aituber_tts_'.
    """
    # Security: only allow specific filename patterns
    if not filename.startswith("aituber_tts_") or not filename.endswith(".wav"):
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Check in temp directory
    audio_path = Path(tempfile.gettempdir()) / filename

    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        path=str(audio_path),
        media_type="audio/wav",
        filename=filename
    )
