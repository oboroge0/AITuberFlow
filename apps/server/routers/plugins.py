from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import os
import json
from pathlib import Path

router = APIRouter(prefix="/api/plugins", tags=["plugins"])

# Base path for plugins
PLUGINS_DIR = Path(__file__).parent.parent.parent.parent / "plugins"


def load_plugin_manifest(plugin_dir: Path) -> Dict[str, Any]:
    """Load a plugin manifest from its directory."""
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.exists():
        return None

    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_all_plugins() -> List[Dict[str, Any]]:
    """Get all available plugins."""
    plugins = []

    if not PLUGINS_DIR.exists():
        return plugins

    for item in PLUGINS_DIR.iterdir():
        if item.is_dir():
            manifest = load_plugin_manifest(item)
            if manifest:
                plugins.append(manifest)

    return plugins


@router.get("", response_model=List[Dict[str, Any]])
async def list_plugins():
    """List all available plugins."""
    return get_all_plugins()


@router.get("/{plugin_id}", response_model=Dict[str, Any])
async def get_plugin(plugin_id: str):
    """Get a specific plugin manifest."""
    plugin_dir = PLUGINS_DIR / plugin_id
    if not plugin_dir.exists():
        raise HTTPException(status_code=404, detail="Plugin not found")

    manifest = load_plugin_manifest(plugin_dir)
    if not manifest:
        raise HTTPException(status_code=404, detail="Plugin manifest not found")

    return manifest
