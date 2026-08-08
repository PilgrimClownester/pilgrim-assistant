import logging
import os
import json
import shutil
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
FRONTEND_DEPS_DIR = FRONTEND_DIR / ".deps"
API_HOST = os.getenv("FIREFLY_API_HOST", "127.0.0.1")
DEFAULT_API_PORT = int(os.getenv("FIREFLY_API_PORT", "8000"))
FRONTEND_PORT = 5173
MOBILE_FRONTEND_PORT = 5174


def detect_mobile_frontend_host() -> str | None:
    configured = os.getenv("FIREFLY_MOBILE_HOST", "").strip()
    if configured:
        return configured
    if os.name == "nt":
        return None
    try:
        output = subprocess.check_output(
            ["ip", "-o", "-4", "addr", "show", "dev", "oray_vnc"],
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    for token in output.split():
        if "/" in token:
            address = token.split("/", 1)[0]
            try:
                socket.inet_aton(address)
            except OSError:
                continue
            return address
    return None


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


def _find_port_pids_windows(port: int) -> list[int]:
    try:
        output = subprocess.check_output(
            ["netstat", "-ano", "-p", "TCP"],
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except (OSError, subprocess.CalledProcessError):
        return []

    pids: set[int] = set()
    for line in output.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[0].upper() != "TCP":
            continue
        local_address = parts[1]
        state = parts[-2].upper()
        pid_text = parts[-1]
        if state != "LISTENING" or not pid_text.isdigit():
            continue
        if local_address.rsplit(":", 1)[-1] == str(port):
            pids.add(int(pid_text))
    return sorted(pids)


def find_port_pids(port: int) -> list[int]:
    if os.name == "nt":
        return _find_port_pids_windows(port)

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


def stop_port_processes(port: int) -> bool:
    pids = find_port_pids(port)
    if not pids:
        return False
    print(f"停止占用 {port} 端口的旧后端进程：{', '.join(str(pid) for pid in pids)}")
    for pid in pids:
        _stop_pid(pid)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if not find_port_pids(port):
            return True
        time.sleep(0.2)
    for pid in find_port_pids(port):
        _stop_pid(pid, force=True)
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


def platform_key() -> str:
    if os.name == "nt":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def platform_node_modules_path() -> Path:
    return FRONTEND_DEPS_DIR / f"{platform_key()}-node_modules"


def detect_node_modules_platform(path: Path) -> str | None:
    electron_dist = path / "electron" / "dist"
    if (electron_dist / "electron.exe").exists():
        return "windows"
    if (electron_dist / "electron").exists():
        return "linux"
    if (electron_dist / "Electron.app").exists():
        return "macos"
    return None


def _is_symlink_or_junction(path: Path) -> bool:
    if path.is_symlink():
        return True
    if os.name != "nt" or not path.exists():
        return False
    try:
        attrs = subprocess.check_output(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"(Get-Item -LiteralPath {json.dumps(str(path))}).Attributes.ToString()",
            ],
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except (OSError, subprocess.CalledProcessError):
        return False
    return "ReparsePoint" in attrs


def _remove_node_modules_link(path: Path) -> None:
    if not path.exists() and not path.is_symlink():
        return
    if os.name == "nt" and not path.is_symlink():
        subprocess.run(["cmd", "/c", "rmdir", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        path.unlink()


def _link_node_modules(target: Path) -> None:
    if os.name == "nt":
        subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(FRONTEND_NODE_MODULES), str(target)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return
    FRONTEND_NODE_MODULES.symlink_to(target, target_is_directory=True)


def activate_node_modules(target: Path) -> bool:
    try:
        _link_node_modules(target)
    except (OSError, subprocess.CalledProcessError):
        if FRONTEND_NODE_MODULES.exists() or FRONTEND_NODE_MODULES.is_symlink():
            return False
        print("当前文件系统不支持 node_modules 链接，改用直接目录模式。")
        shutil.move(str(target), str(FRONTEND_NODE_MODULES))
    return True


def install_frontend_dependencies(target: Path) -> bool:
    npm = "npm.cmd" if os.name == "nt" else "npm"
    if FRONTEND_NODE_MODULES.exists() or FRONTEND_NODE_MODULES.is_symlink():
        _remove_node_modules_link(FRONTEND_NODE_MODULES)
    print(f"正在为 {platform_key()} 安装前端依赖，第一次会慢一点。")
    result = subprocess.run([npm, "install"], cwd=FRONTEND_DIR)
    if result.returncode != 0:
        print("前端依赖安装失败。请检查 Node.js/npm 和网络，然后重新运行启动脚本。", file=sys.stderr)
        return False
    if not FRONTEND_NODE_MODULES.exists():
        print("npm install 完成，但没有生成 node_modules。", file=sys.stderr)
        return False
    if target.exists():
        backup = FRONTEND_DEPS_DIR / f"{platform_key()}-node_modules-{int(time.time())}"
        shutil.move(str(target), str(backup))
    shutil.move(str(FRONTEND_NODE_MODULES), str(target))
    return True


def ensure_platform_node_modules() -> bool:
    target = platform_node_modules_path()
    FRONTEND_DEPS_DIR.mkdir(exist_ok=True)

    if FRONTEND_NODE_MODULES.exists() and not _is_symlink_or_junction(FRONTEND_NODE_MODULES):
        existing_platform = detect_node_modules_platform(FRONTEND_NODE_MODULES) or "unknown"
        existing_target = FRONTEND_DEPS_DIR / f"{existing_platform}-node_modules"
        if existing_platform == "unknown" or existing_target.exists():
            backup = FRONTEND_DEPS_DIR / f"{existing_platform}-node_modules-{int(time.time())}"
            print(f"检测到旧 node_modules，移动到：{backup}")
            shutil.move(str(FRONTEND_NODE_MODULES), str(backup))
        else:
            print(f"迁移当前 {existing_platform} node_modules 到 {existing_target}")
            shutil.move(str(FRONTEND_NODE_MODULES), str(existing_target))

    if not target.exists():
        if not install_frontend_dependencies(target):
            print("你也可以手动运行：", file=sys.stderr)
            print("  cd frontend-react", file=sys.stderr)
            print("  npm install", file=sys.stderr)
            return False

    if FRONTEND_NODE_MODULES.exists() or FRONTEND_NODE_MODULES.is_symlink():
        if FRONTEND_NODE_MODULES.resolve() == target.resolve():
            return True
        _remove_node_modules_link(FRONTEND_NODE_MODULES)

    if not activate_node_modules(target):
        print(f"无法把 node_modules 切换到 {target}", file=sys.stderr)
        print(f"你可以手动删除 {FRONTEND_NODE_MODULES}，再重新运行启动脚本。", file=sys.stderr)
        return False
    return True


def main() -> int:
    if not FRONTEND_DIR.exists():
        print("找不到 frontend-react 目录。", file=sys.stderr)
        return 1

    if not ensure_platform_node_modules():
        return 1

    api_port = DEFAULT_API_PORT
    npm = "npm.cmd" if os.name == "nt" else "npm"
    backend = None
    frontend = None
    mobile_frontend = None

    def handle_stop(signum, frame):  # noqa: ARG001
        terminate(mobile_frontend)
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
        frontend_env.pop("ELECTRON_RUN_AS_NODE", None)
        frontend_env["VITE_FIREFLY_API_BASE"] = f"http://{API_HOST}:{api_port}"
        frontend = subprocess.Popen([npm, "run", "dev"], cwd=FRONTEND_DIR, env=frontend_env)

        mobile_host = detect_mobile_frontend_host()
        if mobile_host:
            if is_port_in_use(MOBILE_FRONTEND_PORT):
                stop_port_processes(MOBILE_FRONTEND_PORT)
            mobile_env = os.environ.copy()
            mobile_env.pop("ELECTRON_RUN_AS_NODE", None)
            mobile_env["VITE_FIREFLY_API_BASE"] = "/api"
            proxy_host = "127.0.0.1" if API_HOST in {"0.0.0.0", "::"} else API_HOST
            mobile_env["FIREFLY_PROXY_TARGET"] = f"http://{proxy_host}:{api_port}"
            mobile_frontend = subprocess.Popen(
                [
                    npm,
                    "run",
                    "dev:web",
                    "--",
                    "--host",
                    mobile_host,
                    "--port",
                    str(MOBILE_FRONTEND_PORT),
                ],
                cwd=FRONTEND_DIR,
                env=mobile_env,
            )
            print(f"Firefly 手机入口：http://{mobile_host}:{MOBILE_FRONTEND_PORT}")
        else:
            print("未检测到蒲公英 oray_vnc 网卡，跳过手机入口。")
        return frontend.wait()
    finally:
        terminate(mobile_frontend)
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
