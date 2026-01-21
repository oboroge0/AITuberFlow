"""
Integrations router for external service APIs (VOICEVOX, etc.)
"""

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from typing import List, Optional
from pathlib import Path
import httpx
import logging
import os
import shutil
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

# Directory for uploaded models (relative to server)
# In production, this should be configurable
UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "apps" / "web" / "public" / "models"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Directory for uploaded animations
ANIMATIONS_DIR = Path(__file__).parent.parent.parent.parent / "apps" / "web" / "public" / "animations"
ANIMATIONS_DIR.mkdir(parents=True, exist_ok=True)

# Directory for generated audio files
AUDIO_DIR = Path(__file__).parent.parent.parent.parent / "apps" / "server" / "audio_output"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Allowed file extensions
ALLOWED_EXTENSIONS = {".vrm", ".png", ".jpg", ".jpeg", ".gif", ".webp"}
ALLOWED_ANIMATION_EXTENSIONS = {".fbx", ".glb", ".gltf"}


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
    Audio files are stored in the server audio_output directory.
    """
    # Security: allow only .wav files with no path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Invalid filename")

    audio_path = (AUDIO_DIR / filename).resolve()
    if not audio_path.exists() or audio_path.parent != AUDIO_DIR.resolve():
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        path=str(audio_path),
        media_type="audio/wav",
        filename=filename
    )


@router.post("/models/upload")
async def upload_model(file: UploadFile = File(...)):
    """
    Upload a VRM model or image file.
    Returns the URL path to access the uploaded file.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Check file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Generate unique filename to avoid conflicts
    unique_id = str(uuid.uuid4())[:8]
    safe_filename = f"{unique_id}_{Path(file.filename).stem}{ext}"
    file_path = UPLOAD_DIR / safe_filename

    try:
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Return the URL path (served by backend API)
        url_path = f"/api/integrations/models/file/{safe_filename}"

        logger.info(f"Uploaded model: {safe_filename}")

        return {
            "success": True,
            "filename": safe_filename,
            "url": url_path,
            "size": file_path.stat().st_size
        }

    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        # Clean up on error
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")


@router.get("/models")
async def list_models():
    """
    List all uploaded models.
    """
    try:
        models = []
        for file_path in UPLOAD_DIR.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in ALLOWED_EXTENSIONS:
                models.append({
                    "filename": file_path.name,
                    "url": f"/api/integrations/models/file/{file_path.name}",
                    "size": file_path.stat().st_size,
                    "type": "vrm" if file_path.suffix.lower() == ".vrm" else "image"
                })

        return {"models": models}

    except Exception as e:
        logger.error(f"Error listing models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list models: {str(e)}")


@router.delete("/models/{filename}")
async def delete_model(filename: str):
    """
    Delete an uploaded model.
    """
    # Security: validate filename
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = UPLOAD_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        file_path.unlink()
        logger.info(f"Deleted model: {filename}")
        return {"success": True, "message": f"Deleted {filename}"}

    except Exception as e:
        logger.error(f"Error deleting file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")


@router.get("/models/file/{filename}")
async def serve_model(filename: str):
    """
    Serve uploaded model files directly from backend.
    This allows access without Next.js dev server restart.
    """
    # Security: validate filename
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = UPLOAD_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type
    ext = file_path.suffix.lower()
    media_types = {
        ".vrm": "model/gltf-binary",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename
    )


# Animation file endpoints
@router.post("/animations/upload")
async def upload_animation(file: UploadFile = File(...)):
    """
    Upload an animation file (FBX from Mixamo, etc.).
    Returns the URL path to access the uploaded file.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Check file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_ANIMATION_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_ANIMATION_EXTENSIONS)}"
        )

    # Generate unique filename to avoid conflicts
    unique_id = str(uuid.uuid4())[:8]
    safe_filename = f"{unique_id}_{Path(file.filename).stem}{ext}"
    file_path = ANIMATIONS_DIR / safe_filename

    try:
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Return the URL path
        url_path = f"/api/integrations/animations/file/{safe_filename}"

        logger.info(f"Uploaded animation: {safe_filename}")

        return {
            "success": True,
            "filename": safe_filename,
            "url": url_path,
            "size": file_path.stat().st_size
        }

    except Exception as e:
        logger.error(f"Error uploading animation: {e}")
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")


@router.get("/animations")
async def list_animations():
    """
    List all uploaded animations.
    """
    try:
        animations = []
        for file_path in ANIMATIONS_DIR.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in ALLOWED_ANIMATION_EXTENSIONS:
                animations.append({
                    "filename": file_path.name,
                    "url": f"/api/integrations/animations/file/{file_path.name}",
                    "size": file_path.stat().st_size,
                    "type": file_path.suffix.lower()[1:]  # fbx, glb, etc.
                })

        return {"animations": animations}

    except Exception as e:
        logger.error(f"Error listing animations: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list animations: {str(e)}")


@router.delete("/animations/{filename}")
async def delete_animation(filename: str):
    """
    Delete an uploaded animation.
    """
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = ANIMATIONS_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        file_path.unlink()
        logger.info(f"Deleted animation: {filename}")
        return {"success": True, "message": f"Deleted {filename}"}

    except Exception as e:
        logger.error(f"Error deleting animation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")


@router.get("/animations/file/{filename}")
async def serve_animation(filename: str):
    """
    Serve uploaded animation files.
    """
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = ANIMATIONS_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    ext = file_path.suffix.lower()
    media_types = {
        ".fbx": "application/octet-stream",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename
    )


# VRM Model file endpoints
ALLOWED_MODEL_EXTENSIONS = {".vrm"}


@router.post("/models/upload")
async def upload_model(file: UploadFile = File(...)):
    """
    Upload a VRM model file.
    Returns the URL path to access the uploaded file.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Check file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_MODEL_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_MODEL_EXTENSIONS)}"
        )

    # Generate unique filename to avoid conflicts
    unique_id = str(uuid.uuid4())[:8]
    safe_filename = f"{unique_id}_{Path(file.filename).stem}{ext}"
    file_path = UPLOAD_DIR / safe_filename

    try:
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Return the URL path (relative to public folder)
        url_path = f"/models/{safe_filename}"

        logger.info(f"Uploaded model: {safe_filename}")

        return {
            "success": True,
            "filename": safe_filename,
            "url": url_path,
            "size": file_path.stat().st_size
        }

    except Exception as e:
        logger.error(f"Error uploading model: {e}")
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")


@router.get("/models")
async def list_models():
    """
    List all uploaded VRM models.
    """
    try:
        models = []
        for file_path in UPLOAD_DIR.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in ALLOWED_MODEL_EXTENSIONS:
                models.append({
                    "filename": file_path.name,
                    "url": f"/models/{file_path.name}",
                    "size": file_path.stat().st_size,
                })

        return {"models": models}

    except Exception as e:
        logger.error(f"Error listing models: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list models: {str(e)}")


@router.delete("/models/{filename}")
async def delete_model(filename: str):
    """
    Delete an uploaded VRM model.
    """
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = UPLOAD_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        file_path.unlink()
        logger.info(f"Deleted model: {filename}")
        return {"success": True, "message": f"Deleted {filename}"}

    except Exception as e:
        logger.error(f"Error deleting model: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")
