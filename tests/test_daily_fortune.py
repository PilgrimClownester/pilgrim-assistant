from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import backend.fortune.daily as daily
import backend.main as main
from backend.fortune.yijing import cast_daily_yijing


class DailyFortuneTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.original_path = daily.DAILY_FORTUNE_PATH
        daily.DAILY_FORTUNE_PATH = Path(self.temporary.name) / "daily_fortune.json"

    def tearDown(self) -> None:
        daily.DAILY_FORTUNE_PATH = self.original_path
        self.temporary.cleanup()

    def test_daily_hexagram_is_stable_and_uses_three_coin_lines(self) -> None:
        first = cast_daily_yijing("2026-08-08")
        repeated = cast_daily_yijing("2026-08-08")
        next_day = cast_daily_yijing("2026-08-09")

        self.assertEqual(first, repeated)
        self.assertNotEqual(first["lines"], next_day["lines"])
        self.assertEqual(first["method"], "three_coins")
        self.assertEqual(len(first["lines"]), 6)
        self.assertTrue(all(line in {6, 7, 8, 9} for line in first["lines"]))
        self.assertIn("name", first["main_hexagram"])
        self.assertIn("name", first["changed_hexagram"])

    def test_prompt_combines_hexagram_and_reality_without_inventing_classics(self) -> None:
        target = "2026-08-08"
        seed = daily.generate_daily_seed(target)
        gua = cast_daily_yijing(target)
        prompt = daily.build_daily_user_prompt(
            seed,
            gua,
            {
                "stats": {"pending": 2, "overdue": 1, "events": 1},
                "lead": {"title": "整理报告", "detail": "今天到期"},
                "signals": [{"title": "留意项目", "detail": "确认下一步"}],
            },
        )

        self.assertIn(str(gua["main_hexagram"]["name"]), prompt)
        self.assertIn(str(gua["changed_hexagram"]["name"]), prompt)
        self.assertIn("整理报告", prompt)
        self.assertIn("不要杜撰爻辞原文", prompt)

    def test_old_or_empty_cache_is_regenerated_once_with_new_method(self) -> None:
        target = "2026-08-08"
        daily.DAILY_FORTUNE_PATH.write_text(
            json.dumps({"entries": {target: {"type": "daily", "seed": {"date": target}, "answer": ""}}}),
            encoding="utf-8",
        )
        self.assertIsNone(daily.load_daily_fortune(target))

        calls = 0

        def factory() -> dict[str, object]:
            nonlocal calls
            calls += 1
            return {
                "type": "daily",
                "seed": daily.generate_daily_seed(target),
                "yijing": cast_daily_yijing(target),
                "answer": "今日日卦：测试内容",
            }

        created, was_cached = daily.get_or_create_daily_fortune(factory, target)
        loaded, is_cached = daily.get_or_create_daily_fortune(factory, target)
        self.assertFalse(was_cached)
        self.assertTrue(is_cached)
        self.assertEqual(calls, 1)
        self.assertEqual(created["method_version"], 2)
        self.assertEqual(loaded["yijing"], created["yijing"])

    def test_daily_api_returns_hexagram_and_reuses_the_result(self) -> None:
        original_ask = main._ask_fortune
        original_brief = main.build_daily_brief
        calls = 0

        def fake_ask(prompt: str) -> str:
            nonlocal calls
            calls += 1
            self.assertIn("今日日卦（三枚钱币法", prompt)
            self.assertIn("现实中的落点", prompt)
            return "今日日卦：卦象测试\n现实中的落点：先做一件事\n今日行动：开始\n流萤寄语：慢慢来"

        main._ask_fortune = fake_ask
        main.build_daily_brief = lambda **_: {
            "stats": {"pending": 1, "overdue": 0, "events": 0},
            "lead": {"title": "测试任务", "detail": "先完成它"},
            "signals": [],
        }
        client = TestClient(main.app)
        try:
            created = client.get("/fortune/daily")
            cached = client.get("/fortune/daily")
        finally:
            client.close()
            main._ask_fortune = original_ask
            main.build_daily_brief = original_brief

        self.assertEqual(created.status_code, 200)
        self.assertFalse(created.json()["cached"])
        self.assertEqual(created.json()["method_version"], 2)
        self.assertEqual(created.json()["yijing"]["method"], "three_coins")
        self.assertTrue(cached.json()["cached"])
        self.assertEqual(calls, 1)


if __name__ == "__main__":
    unittest.main()
