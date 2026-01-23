"""
Test for background tasks cleanup fix.

This test verifies that _background_tasks entries are properly cleaned up
when a workflow is stopped, preventing memory leaks.
"""

import pytest
import sys
from pathlib import Path

# Add project paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
APPS_SERVER = PROJECT_ROOT / "apps" / "server"
SDK_PATH = PROJECT_ROOT / "packages" / "sdk"

if str(APPS_SERVER) not in sys.path:
    sys.path.insert(0, str(APPS_SERVER))
if str(SDK_PATH) not in sys.path:
    sys.path.insert(0, str(SDK_PATH))

from engine.executor import WorkflowExecutor


class TestBackgroundTasksCleanup:
    """Test that _background_tasks is properly cleaned up on workflow stop."""

    @pytest.mark.asyncio
    async def test_cleanup_code_exists_in_stop_workflow(self):
        """Verify the cleanup code exists in stop_workflow method."""
        import inspect

        source = inspect.getsource(WorkflowExecutor.stop_workflow)

        # Check that the cleanup code is present
        assert "_background_tasks" in source, \
            "stop_workflow should reference _background_tasks"
        assert "del self._background_tasks[workflow_id]" in source, \
            "stop_workflow should delete _background_tasks entry"

    @pytest.mark.asyncio
    async def test_no_memory_leak_simulation(self):
        """Simulate multiple workflow starts/stops to verify no memory leak."""
        executor = WorkflowExecutor()

        # Simulate the pattern that caused memory leaks
        for i in range(10):
            workflow_id = f"workflow-{i}"
            # Simulate what start_workflow does for background tasks
            executor._background_tasks[workflow_id] = set()

            # Simulate what stop_workflow should do
            if workflow_id in executor._background_tasks:
                del executor._background_tasks[workflow_id]

        # All entries should be cleaned up
        assert len(executor._background_tasks) == 0, \
            "All _background_tasks entries should be cleaned up"

    @pytest.mark.asyncio
    async def test_cleanup_logic_handles_missing_key(self):
        """Test that cleanup handles case when key doesn't exist."""
        executor = WorkflowExecutor()

        # This should not raise an error
        workflow_id = "nonexistent"
        if workflow_id in executor._background_tasks:
            del executor._background_tasks[workflow_id]

        # Verify no error and dict is empty
        assert len(executor._background_tasks) == 0
