from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import uuid4
from datetime import datetime

from db.database import get_db, WorkflowDB
from models.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    ExecutionStatus,
    ExecutionRequest,
)
from engine.executor import WorkflowExecutor

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

# Global executor instance
executor = WorkflowExecutor()


def workflow_to_response(db_workflow: WorkflowDB) -> dict:
    """Convert database workflow to response format."""
    return {
        "id": db_workflow.id,
        "name": db_workflow.name,
        "description": db_workflow.description,
        "nodes": db_workflow.nodes,
        "connections": db_workflow.connections,
        "character": db_workflow.character,
        "createdAt": db_workflow.created_at.isoformat(),
        "updatedAt": db_workflow.updated_at.isoformat(),
    }


@router.post("", response_model=dict)
async def create_workflow(workflow: WorkflowCreate, db: Session = Depends(get_db)):
    """Create a new workflow."""
    workflow_id = str(uuid4())

    db_workflow = WorkflowDB(
        id=workflow_id,
        name=workflow.name,
        description=workflow.description,
    )
    db_workflow.nodes = [n.model_dump(by_alias=True) for n in workflow.nodes]
    db_workflow.connections = [c.model_dump(by_alias=True) for c in workflow.connections]
    db_workflow.character = workflow.character.model_dump()

    db.add(db_workflow)
    db.commit()
    db.refresh(db_workflow)

    return workflow_to_response(db_workflow)


@router.get("", response_model=List[dict])
async def list_workflows(db: Session = Depends(get_db)):
    """List all workflows."""
    workflows = db.query(WorkflowDB).order_by(WorkflowDB.updated_at.desc()).all()
    return [workflow_to_response(w) for w in workflows]


@router.get("/{workflow_id}", response_model=dict)
async def get_workflow(workflow_id: str, db: Session = Depends(get_db)):
    """Get a specific workflow."""
    db_workflow = db.query(WorkflowDB).filter(WorkflowDB.id == workflow_id).first()
    if not db_workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow_to_response(db_workflow)


@router.put("/{workflow_id}", response_model=dict)
async def update_workflow(
    workflow_id: str, workflow: WorkflowUpdate, db: Session = Depends(get_db)
):
    """Update a workflow."""
    db_workflow = db.query(WorkflowDB).filter(WorkflowDB.id == workflow_id).first()
    if not db_workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if workflow.name is not None:
        db_workflow.name = workflow.name
    if workflow.description is not None:
        db_workflow.description = workflow.description
    if workflow.nodes is not None:
        db_workflow.nodes = [n.model_dump(by_alias=True) for n in workflow.nodes]
    if workflow.connections is not None:
        db_workflow.connections = [c.model_dump(by_alias=True) for c in workflow.connections]
    if workflow.character is not None:
        db_workflow.character = workflow.character.model_dump()

    db_workflow.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(db_workflow)

    return workflow_to_response(db_workflow)


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    """Delete a workflow."""
    db_workflow = db.query(WorkflowDB).filter(WorkflowDB.id == workflow_id).first()
    if not db_workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Stop execution if running
    await executor.stop_workflow(workflow_id)

    db.delete(db_workflow)
    db.commit()

    return {"status": "deleted"}


@router.post("/{workflow_id}/start")
async def start_workflow(
    workflow_id: str,
    request: Optional[ExecutionRequest] = Body(default=None),
    db: Session = Depends(get_db)
):
    """Start workflow execution with current state from frontend."""
    db_workflow = db.query(WorkflowDB).filter(WorkflowDB.id == workflow_id).first()
    if not db_workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Use provided data (current frontend state) or fall back to saved data
    if request and request.nodes is not None:
        nodes = [n.model_dump(by_alias=True) for n in request.nodes]
    else:
        nodes = db_workflow.nodes

    if request and request.connections is not None:
        connections = [c.model_dump(by_alias=True) for c in request.connections]
    else:
        connections = db_workflow.connections

    if request and request.character is not None:
        character = request.character.model_dump()
    else:
        character = db_workflow.character

    # Start execution with current state
    workflow_data = {
        "id": db_workflow.id,
        "name": db_workflow.name,
        "nodes": nodes,
        "connections": connections,
        "character": character,
    }

    await executor.start_workflow(workflow_id, workflow_data)

    return {"status": "started", "workflow_id": workflow_id}


@router.post("/{workflow_id}/stop")
async def stop_workflow(workflow_id: str):
    """Stop workflow execution."""
    await executor.stop_workflow(workflow_id)
    return {"status": "stopped", "workflow_id": workflow_id}


@router.get("/{workflow_id}/status")
async def get_workflow_status(workflow_id: str):
    """Get workflow execution status."""
    status = executor.get_status(workflow_id)
    return ExecutionStatus(
        workflow_id=workflow_id,
        status=status.get("status", "idle"),
        started_at=status.get("started_at"),
        error=status.get("error"),
    )
