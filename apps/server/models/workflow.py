from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class Position(BaseModel):
    x: float
    y: float


class EventFilter(BaseModel):
    event: str
    condition: Optional[str] = None


class NodeModel(BaseModel):
    id: str
    type: str
    position: Position
    config: Dict[str, Any] = Field(default_factory=dict)
    event_filters: Optional[List[EventFilter]] = Field(default=None, alias="eventFilters")

    class Config:
        populate_by_name = True


class ConnectionEndpoint(BaseModel):
    node_id: str = Field(alias="nodeId")
    port: str

    class Config:
        populate_by_name = True


class ConnectionModel(BaseModel):
    id: str
    from_endpoint: ConnectionEndpoint = Field(alias="from")
    to_endpoint: ConnectionEndpoint = Field(alias="to")

    class Config:
        populate_by_name = True


class CharacterConfig(BaseModel):
    name: str = "AI Assistant"
    personality: str = "Friendly and helpful virtual streamer"


class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    nodes: List[NodeModel] = Field(default_factory=list)
    connections: List[ConnectionModel] = Field(default_factory=list)
    character: CharacterConfig = Field(default_factory=CharacterConfig)


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    nodes: Optional[List[NodeModel]] = None
    connections: Optional[List[ConnectionModel]] = None
    character: Optional[CharacterConfig] = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    nodes: List[NodeModel] = Field(default_factory=list)
    connections: List[ConnectionModel] = Field(default_factory=list)
    character: CharacterConfig
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    class Config:
        populate_by_name = True
        from_attributes = True


class ExecutionStatus(BaseModel):
    workflow_id: str
    status: str  # "idle", "running", "stopped", "error"
    started_at: Optional[datetime] = None
    error: Optional[str] = None


class ExecutionRequest(BaseModel):
    """Request body for starting workflow execution with current state."""
    nodes: Optional[List[NodeModel]] = None
    connections: Optional[List[ConnectionModel]] = None
    character: Optional[CharacterConfig] = None
