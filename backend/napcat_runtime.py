"""管理由 Firefly 桌面端按需启动的 NapCat QQ 桥接器。"""

from __future__ import annotations

import os
import shlex
import socket
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
_process: subprocess.Popen | None = None
_napcat_qq_process: subprocess.Popen | None = None


def status() -> dict[str, object]:
    running = _process is not None and _process.poll() is None
    qq_running = _napcat_qq_process is not None and _napcat_qq_process.poll() is None
    return {"enabled": running, "allowed_qq": "449140441", "napcat_app_started": qq_running}


def _is_napcat_listening() -> bool:
    ws_url = os.getenv("NAPCAT_WS_URL", "ws://127.0.0.1:8095")
    without_scheme = ws_url.split("://", 1)[-1].split("/", 1)[0]
    host, _, port_text = without_scheme.rpartition(":")
    if not host or not port_text.isdigit():
        return False
    try:
        with socket.create_connection((host, int(port_text)), timeout=0.3):
            return True
    except OSError:
        return False


def _start_napcat_qq_if_needed() -> None:
    global _napcat_qq_process
    if _is_napcat_listening() or (_napcat_qq_process is not None and _napcat_qq_process.poll() is None):
        return
    executable = os.getenv("NAPCAT_QQ_EXECUTABLE", "/home/pilgrim/Napcat/opt/QQ/qq").strip()
    if not executable:
        return
    executable_path = Path(executable).expanduser()
    if not executable_path.is_file():
        raise RuntimeError(f"找不到 NapCat QQ 启动文件：{executable_path}")
    arguments = shlex.split(os.getenv("NAPCAT_QQ_ARGS", ""))
    _napcat_qq_process = subprocess.Popen([str(executable_path), *arguments], cwd=executable_path.parent)


def start(api_base: str) -> dict[str, object]:
    global _process
    if _process is not None and _process.poll() is None:
        return status()

    _start_napcat_qq_if_needed()
    environment = os.environ.copy()
    environment["FIREFLY_API_BASE"] = api_base.rstrip("/")
    _process = subprocess.Popen(
        [sys.executable, "start_napcat_bot.py"],
        cwd=ROOT_DIR,
        env=environment,
    )
    return status()


def stop() -> dict[str, object]:
    global _process, _napcat_qq_process
    if _process is not None and _process.poll() is None:
        _process.terminate()
        try:
            _process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _process.kill()
    _process = None
    if _napcat_qq_process is not None and _napcat_qq_process.poll() is None:
        _napcat_qq_process.terminate()
    _napcat_qq_process = None
    return status()
