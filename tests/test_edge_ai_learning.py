import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import edge_ai_learning


class EdgeAILearningTests(unittest.TestCase):
    def test_checklist_and_stage_progress_are_persisted_together(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "edge-ai.json"
            with patch.object(edge_ai_learning, "STATE_PATH", state_path):
                state = edge_ai_learning.set_edge_ai_task("stage-1", "stage-1-task-1", True)
                self.assertEqual(state["task_checks"]["stage-1"], ["stage-1-task-1"])

                state = edge_ai_learning.set_edge_ai_stage("stage-1", True)
                self.assertIn("stage-1", state["completed"])
                self.assertEqual(state["task_checks"]["stage-1"], ["stage-1-task-1"])

                restored = edge_ai_learning.get_edge_ai_progress()
                self.assertEqual(restored, state)

                state = edge_ai_learning.set_edge_ai_task("stage-1", "stage-1-task-1", False)
                self.assertEqual(state["task_checks"]["stage-1"], [])


if __name__ == "__main__":
    unittest.main()
