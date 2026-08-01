import time
import unittest
from unittest.mock import patch

import backend.auth as auth


class CloudAuthTests(unittest.TestCase):
    def test_password_hash_and_signed_session(self) -> None:
        password_hash = auth.hash_password("测试密码", salt=b"0123456789abcdef", iterations=1_000)
        with patch.object(auth, "AUTH_PASSWORD_HASH", password_hash), patch.object(
            auth, "AUTH_SESSION_SECRET", "test-session-secret"
        ), patch.object(auth, "AUTH_USERNAME", "firefly"):
            self.assertTrue(auth.auth_enabled())
            self.assertTrue(auth.verify_password("测试密码"))
            self.assertFalse(auth.verify_password("错误密码"))
            token = auth.create_session("firefly")
            self.assertTrue(auth.valid_session(token))
            self.assertFalse(auth.valid_session(token + "broken"))
            self.assertFalse(auth.valid_session("not-a-session"))

    def test_expired_session_is_rejected(self) -> None:
        with patch.object(auth, "AUTH_PASSWORD_HASH", "configured"), patch.object(
            auth, "AUTH_SESSION_SECRET", "test-session-secret"
        ), patch.object(auth, "AUTH_USERNAME", "firefly"), patch.object(auth, "AUTH_SESSION_SECONDS", -1):
            token = auth.create_session("firefly")
            time.sleep(0.01)
            self.assertFalse(auth.valid_session(token))


if __name__ == "__main__":
    unittest.main()
