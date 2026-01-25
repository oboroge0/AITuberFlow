"""
Templates API Router

Provides endpoints for listing and loading workflow templates.
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from typing import List

router = APIRouter(prefix="/api/templates", tags=["templates"])

# Path to templates directory (relative to apps/server)
TEMPLATES_DIR = Path(__file__).parent.parent.parent.parent / "templates"


def load_template(template_path: Path) -> dict:
    """Load a template from a JSON file."""
    with open(template_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("", response_model=List[dict])
async def list_templates():
    """List all available workflow templates."""
    templates = []

    if not TEMPLATES_DIR.exists():
        return templates

    for template_file in TEMPLATES_DIR.glob("*.json"):
        try:
            template = load_template(template_file)
            # Return summary info (not full node data)
            templates.append({
                "id": template.get("id", template_file.stem),
                "name": template.get("name", template_file.stem),
                "name_ja": template.get("name_ja", template.get("name", template_file.stem)),
                "description": template.get("description", ""),
                "description_ja": template.get("description_ja", template.get("description", "")),
                "nodeCount": len(template.get("nodes", [])),
                "connectionCount": len(template.get("connections", [])),
            })
        except Exception as e:
            # Skip invalid templates
            continue

    return templates


@router.get("/{template_id}", response_model=dict)
async def get_template(template_id: str):
    """Get a specific template by ID."""
    if not TEMPLATES_DIR.exists():
        raise HTTPException(status_code=404, detail="Templates directory not found")

    # Search for template by ID or filename
    for template_file in TEMPLATES_DIR.glob("*.json"):
        try:
            template = load_template(template_file)
            if template.get("id") == template_id or template_file.stem == template_id:
                return template
        except Exception:
            continue

    raise HTTPException(status_code=404, detail="Template not found")
