"""
AITuberFlow Backend Server

FastAPI application with WebSocket support for real-time communication.
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

from db.database import init_db
from routers import workflows, plugins, integrations, templates
from engine.executor import WorkflowExecutor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Socket.IO setup
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
)

# Global executor instance (shared with workflows router)
executor = WorkflowExecutor()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting AITuberFlow server...")
    init_db()
    logger.info("Database initialized")
    yield
    # Shutdown
    logger.info("Shutting down AITuberFlow server...")


# Create FastAPI app
app = FastAPI(
    title="AITuberFlow API",
    description="Backend API for AITuberFlow visual workflow editor",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(workflows.router)
app.include_router(plugins.router)
app.include_router(integrations.router)
app.include_router(templates.router)

# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/ws/socket.io")


# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    """Handle client connection."""
    logger.info(f"Client connected: {sid}")


@sio.event
async def disconnect(sid):
    """Handle client disconnection."""
    logger.info(f"Client disconnected: {sid}")


@sio.event
async def join(sid, data):
    """Join a workflow room for receiving updates."""
    workflow_id = data.get("workflowId")
    if workflow_id:
        await sio.enter_room(sid, f"workflow:{workflow_id}")
        logger.info(f"Client {sid} joined workflow: {workflow_id}")

        # Set up log callback for this workflow
        async def log_callback(node_id, message, level):
            await sio.emit(
                "log",
                {
                    "nodeId": node_id,
                    "message": message,
                    "level": level,
                    "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
                },
                room=f"workflow:{workflow_id}",
            )

        executor.set_log_callback(workflow_id, log_callback)

        # Set up status callback for node status updates
        async def status_callback(node_id, status, data=None):
            await sio.emit(
                "node.status",
                {
                    "nodeId": node_id,
                    "status": status,
                    "data": data,
                    "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
                },
                room=f"workflow:{workflow_id}",
            )

        executor.set_status_callback(workflow_id, status_callback)

        # Set up event callback for audio, avatar, and subtitle events
        async def event_callback(event):
            if event.type == "audio.generated":
                filename = event.payload.get("filename", "")
                if filename:
                    await sio.emit(
                        "audio",
                        {
                            "filename": filename,
                            "duration": event.payload.get("duration", 0),
                            "text": event.payload.get("text", ""),
                        },
                        room=f"workflow:{workflow_id}",
                    )
            elif event.type == "avatar.expression":
                await sio.emit(
                    "avatar.expression",
                    {
                        "expression": event.payload.get("expression", "neutral"),
                        "intensity": event.payload.get("intensity", 1.0),
                    },
                    room=f"workflow:{workflow_id}",
                )
            elif event.type == "avatar.mouth":
                await sio.emit(
                    "avatar.mouth",
                    {
                        "value": event.payload.get("value", 0.0),
                        "viseme": event.payload.get("viseme"),
                    },
                    room=f"workflow:{workflow_id}",
                )
            elif event.type == "avatar.motion":
                await sio.emit(
                    "avatar.motion",
                    {
                        "motion": event.payload.get("motion", ""),
                    },
                    room=f"workflow:{workflow_id}",
                )
            elif event.type == "avatar.update":
                await sio.emit(
                    "avatar.update",
                    event.payload,
                    room=f"workflow:{workflow_id}",
                )
            elif event.type == "subtitle":
                await sio.emit(
                    "subtitle",
                    {
                        "text": event.payload.get("text", ""),
                    },
                    room=f"workflow:{workflow_id}",
                )

        executor.set_event_callback(workflow_id, event_callback)


@sio.event
async def leave(sid, data):
    """Leave a workflow room."""
    workflow_id = data.get("workflowId")
    if workflow_id:
        await sio.leave_room(sid, f"workflow:{workflow_id}")
        logger.info(f"Client {sid} left workflow: {workflow_id}")


@sio.event
async def workflow_start(sid, data):
    """Start workflow execution via WebSocket."""
    workflow_id = data.get("workflowId")
    if workflow_id:
        # Emit start event
        await sio.emit("execution.started", room=f"workflow:{workflow_id}")


@sio.event
async def workflow_stop(sid, data):
    """Stop workflow execution via WebSocket."""
    workflow_id = data.get("workflowId")
    if workflow_id:
        await executor.stop_workflow(workflow_id)
        await sio.emit(
            "execution.stopped",
            {"reason": "User requested stop"},
            room=f"workflow:{workflow_id}",
        )


@sio.event
async def node_input(sid, data):
    """Handle manual input from nodes."""
    workflow_id = data.get("workflowId")
    node_id = data.get("nodeId")
    input_data = data.get("data")

    if workflow_id and node_id:
        # Emit log for the input
        await sio.emit(
            "log",
            {
                "nodeId": node_id,
                "message": f"Input received: {input_data}",
                "level": "info",
                "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
            },
            room=f"workflow:{workflow_id}",
        )


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "0.1.0"}


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "AITuberFlow API",
        "version": "0.1.0",
        "docs": "/docs",
    }


# Update workflows router to use shared executor
workflows.executor = executor


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8001))
    uvicorn.run(
        "main:socket_app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )
