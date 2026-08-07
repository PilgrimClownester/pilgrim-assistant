from __future__ import annotations

import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

import backend.companion as companion
import backend.growth as growth
import backend.main as main
import backend.learning as learning
import backend.productivity as productivity
import backend.profile as profile
import backend.treehole as treehole
import backend.workspace as workspace
from backend.companion import MemoryCreate, ReflectionCreate
from backend.profile import UserProfile


class IsolatedDataTestCase(unittest.TestCase):
    """Run API tests without reading or modifying the user's real data directory."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.originals = {
            (productivity, "PRODUCTIVITY_PATH"): productivity.PRODUCTIVITY_PATH,
            (growth, "DATA_PATH"): growth.DATA_PATH,
            (workspace, "WORKSPACE_PATH"): workspace.WORKSPACE_PATH,
            (treehole, "TREEHOLE_DIR"): treehole.TREEHOLE_DIR,
            (profile, "PROFILE_PATH"): profile.PROFILE_PATH,
            (companion, "DATA_DIR"): companion.DATA_DIR,
            (companion, "REFLECTIONS_PATH"): companion.REFLECTIONS_PATH,
            (companion, "MEMORIES_PATH"): companion.MEMORIES_PATH,
            (companion, "FOCUS_PATH"): companion.FOCUS_PATH,
            (learning, "LEARNING_PATH"): learning.LEARNING_PATH,
        }
        productivity.PRODUCTIVITY_PATH = self.root / "productivity.json"
        growth.DATA_PATH = self.root / "growth.json"
        workspace.WORKSPACE_PATH = self.root / "workspace.db"
        treehole.TREEHOLE_DIR = self.root / "treehole"
        profile.PROFILE_PATH = self.root / "profile.json"
        companion.DATA_DIR = self.root
        companion.REFLECTIONS_PATH = self.root / "reflections.json"
        companion.MEMORIES_PATH = self.root / "memories.json"
        companion.FOCUS_PATH = self.root / "focus.json"
        learning.LEARNING_PATH = self.root / "learning.json"
        self.client = TestClient(main.app)

    def tearDown(self) -> None:
        self.client.close()
        for (module, name), value in self.originals.items():
            setattr(module, name, value)
        self.temporary.cleanup()


class WorkspaceApiTests(IsolatedDataTestCase):
    def test_profile_and_companion_writes_are_atomic(self) -> None:
        profile.save_profile(UserProfile(nickname="维护测试"))
        companion.save_reflection(ReflectionCreate(win="完成原子写入"))
        companion.create_memory(MemoryCreate(content="保留最后一次有效数据"))

        self.assertEqual(profile.get_profile().nickname, "维护测试")
        self.assertEqual(companion.list_reflections()[0].win, "完成原子写入")
        self.assertEqual(companion.list_memories()[0].content, "保留最后一次有效数据")
        self.assertEqual(list(self.root.glob("*.tmp")), [])

    def test_memory_controls_are_backward_compatible_and_respected_by_chat(self) -> None:
        companion.MEMORIES_PATH.write_text(
            '[{"id":"legacy-memory","content":"旧记忆仍然可用","category":"context","created_at":"2026-01-01T08:00:00"}]',
            encoding="utf-8",
        )
        legacy = self.client.get("/companion/memories").json()["items"][0]
        self.assertTrue(legacy["use_in_chat"])
        self.assertFalse(legacy["is_frozen"])

        created = self.client.post(
            "/companion/memories",
            json={"content": "只在本地保留的背景", "category": "boundary", "use_in_chat": False},
        ).json()["item"]
        self.assertNotIn("只在本地保留的背景", companion.build_memory_context())

        updated = self.client.patch(
            f"/companion/memories/{created['id']}",
            json={"content": "修改后的私人背景", "use_in_chat": True},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertIn("修改后的私人背景", companion.build_memory_context())

        frozen = self.client.patch(f"/companion/memories/{created['id']}", json={"is_frozen": True}).json()["item"]
        self.assertTrue(frozen["is_frozen"])
        self.assertNotIn("修改后的私人背景", companion.build_memory_context())
        self.assertEqual(self.client.patch("/companion/memories/missing", json={"is_frozen": True}).status_code, 404)

    def test_daily_brief_is_local_and_uses_current_workspace(self) -> None:
        today = date.today()
        yesterday = (today - timedelta(days=1)).isoformat()
        today_text = today.isoformat()
        self.client.post("/todos", json={"title": "处理逾期事项", "priority": "high", "due_date": yesterday})
        self.client.post(
            "/schedule",
            json={"title": "上午讨论", "date": today_text, "start_time": "10:30", "end_time": "11:00", "category": "project"},
        )
        self.client.post(
            "/companion/memories",
            json={"content": "先照顾好自己的节奏", "category": "preference", "use_in_chat": False},
        )

        response = self.client.get(f"/companion/today?day={today_text}&hour=10&minute=0")
        self.assertEqual(response.status_code, 200)
        brief = response.json()
        self.assertEqual(brief["period"], "morning")
        self.assertEqual(brief["lead"]["title"], "上午讨论")
        self.assertEqual(brief["stats"]["overdue"], 1)
        self.assertEqual(brief["memory_echo"]["content"], "先照顾好自己的节奏")
        self.assertTrue(brief["private_processing"])
        self.assertEqual(self.client.get("/companion/today?day=not-a-date").status_code, 400)

    def test_controlled_learning_requires_inbox_confirmation(self) -> None:
        candidate = learning.observe_user_message("我喜欢回复简洁一点")
        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.status, "pending")
        self.assertEqual(companion.list_memories(), [])
        self.assertNotIn("回复简洁", companion.build_memory_context())

        pending = self.client.get("/learning/candidates?status=pending").json()["items"]
        self.assertEqual(len(pending), 1)
        confirmed = self.client.post(
            f"/learning/candidates/{candidate.id}/confirm",
            json={"content": "我希望 Firefly 回复简洁、直接。", "category": "preference", "use_in_chat": True},
        )
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.json()["item"]["status"], "confirmed")
        self.assertIn("回复简洁、直接", companion.build_memory_context())
        self.assertEqual(self.client.get("/learning/candidates?status=pending").json()["items"], [])

    def test_learning_feedback_safety_pause_and_rejection(self) -> None:
        self.assertIsNone(learning.observe_user_message("我喜欢使用密码：secret-123456"))
        self.assertIsNone(learning.observe_user_message("以后可能会移动到别的服务器"))
        self.assertIsNone(learning.observe_user_message("我喜欢塔罗占卜"))
        self.assertEqual(self.client.get("/learning/candidates").json()["items"], [])
        self.assertEqual(
            self.client.post("/learning/feedback", json={"kind": "remember", "content": "邮箱 pilgrim@example.com"}).status_code,
            400,
        )

        feedback = self.client.post("/learning/feedback", json={"kind": "too_long"})
        self.assertEqual(feedback.status_code, 200)
        candidate_id = feedback.json()["item"]["id"]
        rejected = self.client.post(f"/learning/candidates/{candidate_id}/reject")
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.json()["item"]["status"], "rejected")

        paused = self.client.patch("/learning/preferences", json={"enabled": False}).json()["preferences"]
        self.assertFalse(paused["enabled"])
        self.assertIsNone(learning.observe_user_message("我的长期目标是完成毕业设计"))
        summary = self.client.get("/learning/weekly").json()
        self.assertEqual(summary["rejected"], 1)
        self.assertEqual(summary["pending"], 0)

    def test_offline_inbox_examples(self) -> None:
        cases = {
            "午饭 15": ("expense", "amount", 15.0),
            "明天下午三点提醒我交报告": ("schedule", "start_time", "15:00"),
            "每周跑步三次": ("habit", "weekly_target", 3),
        }
        for text, (kind, field, expected) in cases.items():
            with self.subTest(text=text):
                response = self.client.post("/inbox/parse", json={"text": text})
                self.assertEqual(response.status_code, 200)
                proposal = response.json()["proposal"]
                self.assertEqual(proposal["kind"], kind)
                self.assertEqual(proposal["payload"][field], expected)

    def test_project_relations_and_inbox_undo(self) -> None:
        deadline = (date.today() + timedelta(days=20)).isoformat()
        response = self.client.post(
            "/projects",
            json={
                "title": "维护测试项目",
                "deadline": deadline,
                "milestones": [{"title": "完成验收", "weight": 2}],
                "tasks": [{"title": "整理清单", "priority": "high"}],
            },
        )
        self.assertEqual(response.status_code, 200)
        project_id = response.json()["item"]["id"]

        additions = [
            (f"/projects/{project_id}/events", {"title": "评审", "date": deadline, "category": "project"}),
            (f"/projects/{project_id}/decisions", {"decision": "采用本地优先", "rationale": "隐私和离线"}),
            (f"/projects/{project_id}/links", {"title": "设计文档", "url": "docs/design.md", "kind": "document"}),
            (f"/projects/{project_id}/risks", {"text": "时间紧张", "level": "high"}),
        ]
        for path, payload in additions:
            self.assertEqual(self.client.post(path, json=payload).status_code, 200)

        proposal = {
            "kind": "todo",
            "title": "补充说明",
            "description": "测试关联",
            "confidence": 1,
            "rationale": "测试",
            "payload": {"title": "补充说明", "priority": "medium", "due_date": deadline, "notes": "测试"},
            "missing_fields": [],
            "source_text": "补充说明",
        }
        committed = self.client.post("/inbox/commit", json={"proposal": proposal, "project_id": project_id}).json()
        target_id = committed["item"]["id"]
        project = self.client.get(f"/projects/{project_id}").json()["item"]
        self.assertIn(target_id, project["task_ids"])
        self.assertEqual(len(project["events"]), 1)
        self.assertEqual(len(project["decisions"]), 1)
        self.assertEqual(len(project["links"]), 1)
        self.assertEqual(project["open_risks"], 1)

        undone = self.client.delete(f"/inbox/actions/{committed['action']['id']}")
        self.assertEqual(undone.status_code, 200)
        project = self.client.get(f"/projects/{project_id}").json()["item"]
        self.assertNotIn(target_id, project["task_ids"])

    def test_weekly_review_save_and_plan(self) -> None:
        deadline = (date.today() + timedelta(days=30)).isoformat()
        self.client.post("/ideas", json={"content": "值得重看的旧灵感", "category": "产品", "tags": []})
        self.client.post("/habits", json={"name": "阅读", "frequency": "daily", "weekly_target": 5})
        self.client.post("/goals", json={"title": "完成版本", "deadline": deadline, "milestones": []})

        snapshot = self.client.get("/reviews/weekly").json()
        self.assertEqual(snapshot["old_idea"]["content"], "值得重看的旧灵感")
        self.assertTrue(snapshot["habits"])
        self.assertTrue(snapshot["goals"])

        saved = self.client.post(
            "/reviews/weekly",
            json={
                "week_start": snapshot["start"],
                "highlight": "完成回归",
                "challenge": "保持精简",
                "next_focus": "稳定性",
                "note": "继续维护",
                "snapshot": snapshot,
            },
        )
        self.assertEqual(saved.status_code, 200)
        history = self.client.get("/reviews/weekly/history").json()["items"]
        self.assertEqual(history[0]["next_focus"], "稳定性")

        planned = self.client.post(
            "/reviews/weekly/plan",
            json={"tasks": [{"title": "执行下周计划", "priority": "high", "due_date": deadline}]},
        )
        self.assertEqual(planned.status_code, 200)
        titles = [item["title"] for item in self.client.get("/todos").json()["items"]]
        self.assertIn("执行下周计划", titles)


if __name__ == "__main__":
    unittest.main()
