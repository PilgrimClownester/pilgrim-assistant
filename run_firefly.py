import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend-react"
FRONTEND_NODE_MODULES = FRONTEND_DIR / "node_modules"
# The desktop edition is intentionally loopback-only. Do not expose the local
# data API on a LAN or public interface.
API_HOST = "127.0.0.1"
DEFAULT_API_PORT = int(os.getenv("FIREFLY_API_PORT", "8000"))
DEFAULT_FRONTEND_PORT = 5173


def api_url(port: int, path: str) -> str:
    return f"http://{API_HOST}:{port}{path}"


def wait_for_backend(port: int, timeout_seconds: float = 20.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urlopen(api_url(port, "/health"), timeout=1.0) as response:
                return response.status == 200
        except (URLError, TimeoutError):
            time.sleep(0.3)
    return False


def endpoint_available(url: str) -> bool:
    try:
        with urlopen(url, timeout=1.0) as response:
            return response.status == 200
    except (URLError, TimeoutError):
        return False


def is_port_in_use(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.bind((API_HOST, port))
    except OSError:
        return True
    return False


def find_free_port(start: int) -> int:
    port = start
    while port < start + 100:
        if not is_port_in_use(port):
            return port
        port += 1
    raise RuntimeError("No free API port found")


def _stop_pid(pid: int, force: bool = False) -> None:
    if os.name == "nt":
        command = ["taskkill", "/PID", str(pid), "/T"]
        if force:
            command.append("/F")
        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return

    sig = signal.SIGKILL if force and hasattr(signal, "SIGKILL") else signal.SIGTERM
    try:
        os.kill(pid, sig)
    except OSError:
        pass


def _read_proc_text(path: Path) -> str:
    try:
        raw = path.read_bytes()
    except OSError:
        return ""
    return raw.replace(b"\x00", b" ").decode("utf-8", errors="ignore")


def _proc_cwd(pid: int) -> Path | None:
    try:
        return Path(os.readlink(Path("/proc") / str(pid) / "cwd")).resolve()
    except OSError:
        return None


def _windows_processes() -> list[dict]:
    command = [
        "powershell",
        "-NoProfile",
        "-Command",
        (
            "Get-CimInstance Win32_Process | "
            "Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath | "
            "ConvertTo-Json -Compress"
        ),
    ]
    try:
        output = subprocess.check_output(command, text=True, encoding="utf-8", errors="ignore")
    except (OSError, subprocess.CalledProcessError):
        return []
    if not output.strip():
        return []
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        return []
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def find_stale_firefly_pids() -> list[int]:
    current_pid = os.getpid()
    parent_pid = os.getppid()
    matches: set[int] = set()
    root = ROOT_DIR.resolve()
    frontend = FRONTEND_DIR.resolve()

    if os.name == "nt":
        root_text = str(root).lower()
        frontend_text = str(frontend).lower()
        for proc in _windows_processes():
            pid = int(proc.get("ProcessId") or 0)
            parent = int(proc.get("ParentProcessId") or 0)
            if pid in {0, current_pid, parent_pid} or parent == current_pid:
                continue
            cmdline = str(proc.get("CommandLine") or "")
            executable = str(proc.get("ExecutablePath") or "")
            haystack = f"{cmdline} {executable}".lower()
            is_backend = "uvicorn" in haystack and "backend.main:app" in haystack
            is_frontend = (
                "vite" in haystack
                or "electron" in haystack
                or "npm run dev" in haystack
                or "node_modules\\vite" in haystack
                or "node_modules/vite" in haystack
            )
            mentions_project = root_text in haystack or frontend_text in haystack
            if mentions_project and (is_backend or is_frontend):
                matches.add(pid)
        return sorted(matches)

    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        pid = int(proc.name)
        if pid in {current_pid, parent_pid}:
            continue

        cmdline = _read_proc_text(proc / "cmdline")
        if not cmdline:
            continue
        cwd = _proc_cwd(pid)
        in_project = cwd is not None and (cwd == root or cwd == frontend)
        is_backend = "uvicorn backend.main:app" in cmdline or "backend.main:app" in cmdline
        is_frontend = "vite" in cmdline or "electron" in cmdline or "npm run dev" in cmdline
        mentions_project = str(root) in cmdline or str(frontend) in cmdline

        if (in_project or mentions_project) and (is_backend or is_frontend):
            matches.add(pid)

    return sorted(matches)


def stop_stale_firefly_processes() -> None:
    pids = find_stale_firefly_pids()
    if not pids:
        return
    print(f"清理旧 Firefly 进程：{', '.join(str(pid) for pid in pids)}")
    for pid in pids:
        _stop_pid(pid)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        remaining = find_stale_firefly_pids()
        if not remaining:
            return
        time.sleep(0.2)
    for pid in find_stale_firefly_pids():
        _stop_pid(pid, force=True)


def terminate(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def frontend_dependencies_ready() -> bool:
    executable = "vite.cmd" if os.name == "nt" else "vite"
    return (FRONTEND_NODE_MODULES / ".bin" / executable).exists()


def main() -> int:
    if not FRONTEND_DIR.exists():
        print("找不到 frontend-react 目录。", file=sys.stderr)
        return 1

    if not frontend_dependencies_ready():
        print("Frontend dependencies are missing. Run the installer again.", file=sys.stderr)
        return 1

    api_port = DEFAULT_API_PORT
    npm = "npm.cmd" if os.name == "nt" else "npm"
    backend = None
    frontend = None

    def handle_stop(signum, frame):  # noqa: ARG001
        terminate(frontend)
        terminate(backend)
        raise SystemExit(130)

    signal.signal(signal.SIGINT, handle_stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_stop)

    try:
        stop_stale_firefly_processes()

        frontend_port = find_free_port(DEFAULT_FRONTEND_PORT)
        if frontend_port != DEFAULT_FRONTEND_PORT:
            print(f"前端端口 {DEFAULT_FRONTEND_PORT} 已被占用，改用 {frontend_port}。")

        if wait_for_backend(api_port, timeout_seconds=1.0):
            if endpoint_available(api_url(api_port, "/todos")):
                print(f"Firefly 后端已在运行：{api_port}")
            else:
                next_port = find_free_port(api_port + 1)
                print(f"{api_port} 上不是当前 Firefly 后端，改用 {next_port}。")
                api_port = next_port
                backend = start_backend(api_port)
                if not wait_for_backend(api_port) or not endpoint_available(api_url(api_port, "/todos")):
                    print("当前版本后端启动失败。", file=sys.stderr)
                    return 1
        else:
            if is_port_in_use(api_port):
                next_port = find_free_port(api_port + 1)
                print(f"{api_port} 端口已被其他程序使用，改用 {next_port}。")
                api_port = next_port

            print(f"启动 Firefly 后端：{api_port}")
            backend = start_backend(api_port)

            if not wait_for_backend(api_port):
                print("后端启动超时，请检查端口或 .env 配置。", file=sys.stderr)
                return 1

            if not endpoint_available(api_url(api_port, "/todos")):
                print("后端已启动，但 /todos 接口不可用。", file=sys.stderr)
                return 1

        print(f"打开 Firefly 桌面窗口，API：http://{API_HOST}:{api_port}")
        frontend_env = os.environ.copy()
        frontend_env.pop("ELECTRON_RUN_AS_NODE", None)
        frontend_env["VITE_FIREFLY_API_BASE"] = f"http://{API_HOST}:{api_port}"
        frontend_env["FIREFLY_DEV_SERVER_URL"] = f"http://localhost:{frontend_port}"
        frontend = subprocess.Popen(
            [npm, "run", "dev", "--", "--port", str(frontend_port)],
            cwd=FRONTEND_DIR,
            env=frontend_env,
        )

        return frontend.wait()
    finally:
        terminate(frontend)
        terminate(backend)


def start_backend(port: int) -> subprocess.Popen:
    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        API_HOST,
        "--port",
        str(port),
    ]
    return subprocess.Popen(backend_cmd, cwd=ROOT_DIR)


if __name__ == "__main__":
    raise SystemExit(main())
