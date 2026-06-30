import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend-react"
API_HOST = os.getenv("FIREFLY_API_HOST", "127.0.0.1")
DEFAULT_API_PORT = int(os.getenv("FIREFLY_API_PORT", "8000"))
FRONTEND_PORT = 5173


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


def _listening_socket_inodes(port: int) -> set[str]:
    inodes: set[str] = set()
    port_hex = f"{port:04X}"
    for table in [Path("/proc/net/tcp"), Path("/proc/net/tcp6")]:
        if not table.exists():
            continue
        try:
            lines = table.read_text(encoding="utf-8").splitlines()[1:]
        except OSError:
            continue
        for line in lines:
            parts = line.split()
            if len(parts) < 10:
                continue
            local_address = parts[1]
            state = parts[3]
            inode = parts[9]
            if state == "0A" and local_address.upper().endswith(f":{port_hex}"):
                inodes.add(inode)
    return inodes


def find_port_pids(port: int) -> list[int]:
    inodes = _listening_socket_inodes(port)
    if not inodes:
        return []
    pids: set[int] = set()
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        fd_dir = proc / "fd"
        try:
            for fd in fd_dir.iterdir():
                try:
                    target = os.readlink(fd)
                except OSError:
                    continue
                if target.startswith("socket:[") and target[8:-1] in inodes:
                    pids.add(int(proc.name))
                    break
        except OSError:
            continue
    return sorted(pids)


def is_port_in_use(port: int) -> bool:
    return bool(find_port_pids(port))


def find_free_port(start: int) -> int:
    port = start
    while port < start + 100:
        if not is_port_in_use(port):
            return port
        port += 1
    raise RuntimeError("No free API port found")


def stop_port_processes(port: int) -> bool:
    pids = find_port_pids(port)
    if not pids:
        return False
    print(f"停止占用 {port} 端口的旧后端进程：{', '.join(str(pid) for pid in pids)}")
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if not find_port_pids(port):
            return True
        time.sleep(0.2)
    for pid in find_port_pids(port):
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
    time.sleep(0.3)
    return not find_port_pids(port)


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


def find_stale_firefly_pids() -> list[int]:
    current_pid = os.getpid()
    parent_pid = os.getppid()
    matches: set[int] = set()
    root = ROOT_DIR.resolve()
    frontend = FRONTEND_DIR.resolve()

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
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        remaining = find_stale_firefly_pids()
        if not remaining:
            return
        time.sleep(0.2)
    for pid in find_stale_firefly_pids():
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass


def terminate(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def main() -> int:
    if not FRONTEND_DIR.exists():
        print("找不到 frontend-react 目录。", file=sys.stderr)
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

        if is_port_in_use(FRONTEND_PORT):
            print(f"检测到前端端口 {FRONTEND_PORT} 已被占用，尝试关闭旧前端进程。")
            if not stop_port_processes(FRONTEND_PORT):
                print(
                    f"无法释放前端端口 {FRONTEND_PORT}。请先关闭旧的 npm/vite/electron 进程后重试。",
                    file=sys.stderr,
                )
                return 1

        if wait_for_backend(api_port, timeout_seconds=1.0):
            if endpoint_available(api_url(api_port, "/todos")):
                print(f"Firefly 后端已在运行：{api_port}")
            else:
                print(f"检测到 {api_port} 端口上的后端不是当前版本：/todos 接口不可用。")
                if stop_port_processes(api_port):
                    print("旧后端已停止，准备重启当前版本。")
                else:
                    next_port = find_free_port(api_port + 1)
                    print(f"无法停止占用 {api_port} 的进程，改用端口 {next_port}。")
                    api_port = next_port
                backend = start_backend(api_port)
                if not wait_for_backend(api_port) or not endpoint_available(api_url(api_port, "/todos")):
                    print("当前版本后端启动失败。", file=sys.stderr)
                    return 1
        else:
            if is_port_in_use(api_port):
                if stop_port_processes(api_port):
                    print(f"已释放 {api_port} 端口，准备启动当前版本后端。")
                else:
                    next_port = find_free_port(api_port + 1)
                    print(f"{api_port} 端口被占用且无法释放，改用端口 {next_port}。")
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
        frontend_env["VITE_FIREFLY_API_BASE"] = f"http://{API_HOST}:{api_port}"
        frontend = subprocess.Popen([npm, "run", "dev"], cwd=FRONTEND_DIR, env=frontend_env)
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
