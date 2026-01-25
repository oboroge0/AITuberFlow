"""
Tests for the Workflows API endpoints.

Tests CRUD operations and workflow execution via HTTP API.
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Add project paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
APPS_SERVER = PROJECT_ROOT / "apps" / "server"
SDK_PATH = PROJECT_ROOT / "packages" / "sdk"

if str(APPS_SERVER) not in sys.path:
    sys.path.insert(0, str(APPS_SERVER))
if str(SDK_PATH) not in sys.path:
    sys.path.insert(0, str(SDK_PATH))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db.database import Base, get_db
from main import app
from routers import workflows


# Create in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency for testing."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Mock executor
mock_executor = MagicMock()
mock_executor.start_workflow = AsyncMock()
mock_executor.stop_workflow = AsyncMock()
mock_executor.get_status = MagicMock(return_value={"status": "idle"})


@pytest.fixture(scope="module")
def client():
    """Create test client with database override."""
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    workflows.executor = mock_executor
    workflows.socketio = None

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def reset_db():
    """Reset database before each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


class TestWorkflowCRUD:
    """Tests for workflow CRUD operations."""

    def test_create_workflow(self, client):
        """Test creating a new workflow."""
        response = client.post(
            "/api/workflows",
            json={
                "name": "Test Workflow",
                "description": "A test workflow",
                "nodes": [],
                "connections": [],
                "character": {"name": "TestBot", "personality": "Helpful"},
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Workflow"
        assert data["description"] == "A test workflow"
        assert "id" in data
        assert "createdAt" in data
        assert "updatedAt" in data

    def test_list_workflows_empty(self, client):
        """Test listing workflows when empty."""
        response = client.get("/api/workflows")

        assert response.status_code == 200
        assert response.json() == []

    def test_list_workflows_with_data(self, client):
        """Test listing workflows with data."""
        # Create a workflow first
        client.post(
            "/api/workflows",
            json={
                "name": "Workflow 1",
                "description": None,
                "nodes": [],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )

        response = client.get("/api/workflows")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Workflow 1"

    def test_get_workflow(self, client):
        """Test getting a specific workflow."""
        # Create workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Test Workflow",
                "description": "Test",
                "nodes": [],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Get it
        response = client.get(f"/api/workflows/{workflow_id}")

        assert response.status_code == 200
        assert response.json()["id"] == workflow_id

    def test_get_workflow_not_found(self, client):
        """Test getting a non-existent workflow."""
        response = client.get("/api/workflows/nonexistent-id")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_workflow(self, client):
        """Test updating a workflow."""
        # Create workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Original Name",
                "description": "Original",
                "nodes": [],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Update it
        response = client.put(
            f"/api/workflows/{workflow_id}",
            json={
                "name": "Updated Name",
                "description": "Updated description",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"

    def test_update_workflow_not_found(self, client):
        """Test updating a non-existent workflow."""
        response = client.put(
            "/api/workflows/nonexistent-id",
            json={"name": "New Name"},
        )

        assert response.status_code == 404

    def test_delete_workflow(self, client):
        """Test deleting a workflow."""
        # Create workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "To Delete",
                "description": None,
                "nodes": [],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Delete it
        response = client.delete(f"/api/workflows/{workflow_id}")

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

        # Verify it's gone
        get_response = client.get(f"/api/workflows/{workflow_id}")
        assert get_response.status_code == 404

    def test_delete_workflow_not_found(self, client):
        """Test deleting a non-existent workflow."""
        response = client.delete("/api/workflows/nonexistent-id")

        assert response.status_code == 404


class TestWorkflowDuplication:
    """Tests for workflow duplication."""

    def test_duplicate_workflow(self, client):
        """Test duplicating a workflow."""
        # Create original
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Original",
                "description": "Original description",
                "nodes": [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}}],
                "connections": [],
                "character": {"name": "Bot", "personality": "Helpful"},
            },
        )
        original_id = create_response.json()["id"]

        # Duplicate it
        response = client.post(f"/api/workflows/{original_id}/duplicate")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Original (Copy)"
        assert data["id"] != original_id
        assert len(data["nodes"]) == 1

    def test_duplicate_workflow_not_found(self, client):
        """Test duplicating a non-existent workflow."""
        response = client.post("/api/workflows/nonexistent-id/duplicate")

        assert response.status_code == 404


class TestWorkflowExportImport:
    """Tests for workflow export and import."""

    def test_export_workflow(self, client):
        """Test exporting a workflow."""
        # Create workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Export Test",
                "description": "For export",
                "nodes": [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}}],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Export it
        response = client.get(f"/api/workflows/{workflow_id}/export")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Export Test"
        assert data["version"] == "1.0"
        assert "exportedAt" in data
        assert "id" not in data  # ID should not be in export

    def test_import_workflow(self, client):
        """Test importing a workflow."""
        import_data = {
            "name": "Imported Workflow",
            "description": "Imported from JSON",
            "nodes": [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}}],
            "connections": [],
            "character": {"name": "ImportBot", "personality": "Friendly"},
        }

        response = client.post("/api/workflows/import", json=import_data)

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Imported Workflow"
        assert "id" in data
        assert data["character"]["name"] == "ImportBot"

    def test_import_workflow_minimal(self, client):
        """Test importing a workflow with minimal data."""
        import_data = {"name": "Minimal"}

        response = client.post("/api/workflows/import", json=import_data)

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Minimal"
        assert data["nodes"] == []
        assert data["connections"] == []


class TestWorkflowExecution:
    """Tests for workflow execution endpoints."""

    def test_start_workflow(self, client):
        """Test starting workflow execution."""
        # Create workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Execution Test",
                "description": None,
                "nodes": [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}}],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Start execution
        response = client.post(f"/api/workflows/{workflow_id}/start")

        assert response.status_code == 200
        assert response.json()["status"] == "started"
        assert response.json()["workflow_id"] == workflow_id

    def test_start_workflow_with_state(self, client):
        """Test starting workflow with current state from frontend."""
        # Create workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "State Test",
                "description": None,
                "nodes": [],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Start with different state
        response = client.post(
            f"/api/workflows/{workflow_id}/start",
            json={
                "nodes": [{"id": "n1", "type": "manual-input", "position": {"x": 0, "y": 0}}],
                "connections": [],
                "character": {"name": "NewBot", "personality": "Updated"},
            },
        )

        assert response.status_code == 200
        assert response.json()["status"] == "started"

    def test_start_workflow_not_found(self, client):
        """Test starting a non-existent workflow."""
        response = client.post("/api/workflows/nonexistent-id/start")

        assert response.status_code == 404

    def test_stop_workflow(self, client):
        """Test stopping workflow execution."""
        # Create and start workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Stop Test",
                "description": None,
                "nodes": [],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Stop execution (even if not running)
        response = client.post(f"/api/workflows/{workflow_id}/stop")

        assert response.status_code == 200
        assert response.json()["status"] == "stopped"

    def test_get_workflow_status(self, client):
        """Test getting workflow execution status."""
        # Create workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Status Test",
                "description": None,
                "nodes": [],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Get status
        response = client.get(f"/api/workflows/{workflow_id}/status")

        assert response.status_code == 200
        data = response.json()
        assert data["workflow_id"] == workflow_id
        assert data["status"] == "idle"


class TestWorkflowWithNodes:
    """Tests for workflows with actual node data."""

    def test_create_workflow_with_nodes(self, client):
        """Test creating a workflow with nodes."""
        response = client.post(
            "/api/workflows",
            json={
                "name": "Node Test",
                "description": "Test with nodes",
                "nodes": [
                    {
                        "id": "start-1",
                        "type": "start",
                        "position": {"x": 100, "y": 100},
                        "config": {},
                    },
                    {
                        "id": "llm-1",
                        "type": "openai-llm",
                        "position": {"x": 300, "y": 100},
                        "config": {"model": "gpt-4o-mini"},
                    },
                ],
                "connections": [
                    {
                        "id": "conn-1",
                        "from": {"nodeId": "start-1", "port": "trigger"},
                        "to": {"nodeId": "llm-1", "port": "prompt"},
                    }
                ],
                "character": {"name": "TestBot", "personality": "Helpful"},
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["nodes"]) == 2
        assert len(data["connections"]) == 1
        assert data["nodes"][0]["type"] == "start"
        assert data["nodes"][1]["type"] == "openai-llm"

    def test_update_workflow_nodes(self, client):
        """Test updating workflow nodes."""
        # Create workflow
        create_response = client.post(
            "/api/workflows",
            json={
                "name": "Update Nodes Test",
                "description": None,
                "nodes": [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}}],
                "connections": [],
                "character": {"name": "Bot", "personality": ""},
            },
        )
        workflow_id = create_response.json()["id"]

        # Update with new nodes
        response = client.put(
            f"/api/workflows/{workflow_id}",
            json={
                "nodes": [
                    {"id": "n1", "type": "start", "position": {"x": 0, "y": 0}},
                    {"id": "n2", "type": "end", "position": {"x": 200, "y": 0}},
                ],
                "connections": [
                    {"id": "c1", "from": {"nodeId": "n1", "port": "trigger"}, "to": {"nodeId": "n2", "port": "input"}},
                ],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["nodes"]) == 2
        assert len(data["connections"]) == 1
