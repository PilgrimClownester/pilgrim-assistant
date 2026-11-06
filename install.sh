#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend-react"
PYTHON_BIN="${PYTHON_BIN:-python3}"

fail() {
  echo "[Firefly] $1" >&2
  exit 1
}

command -v "$PYTHON_BIN" >/dev/null 2>&1 || fail "Python 3.11+ is required."
command -v node >/dev/null 2>&1 || fail "Node.js 20+ is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."

"$PYTHON_BIN" - <<'PY' || fail "Python 3.11 or newer is required."
import sys
raise SystemExit(0 if sys.version_info >= (3, 11) else 1)
PY

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
[[ "$NODE_MAJOR" -ge 20 ]] || fail "Node.js 20 or newer is required."

echo "[Firefly] Creating the Python environment..."
"$PYTHON_BIN" -m venv "$ROOT_DIR/.venv" || fail "Could not create .venv. Install your distribution's python3-venv package and retry."
"$ROOT_DIR/.venv/bin/python" -m pip install --upgrade pip
"$ROOT_DIR/.venv/bin/python" -m pip install -r "$ROOT_DIR/requirements.txt"

echo "[Firefly] Installing desktop dependencies..."
if [[ -L "$FRONTEND_DIR/node_modules" ]]; then
  unlink "$FRONTEND_DIR/node_modules"
fi
npm ci --prefix "$FRONTEND_DIR"
npm run build --prefix "$FRONTEND_DIR"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "[Firefly] Created .env from the safe example."
fi

mkdir -p "$ROOT_DIR/data/logs" "$ROOT_DIR/data/vector_db" "$ROOT_DIR/data/documents"
chmod +x "$ROOT_DIR/start_firefly.sh"

if [[ "${OSTYPE:-}" == linux* ]]; then
  APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$APPLICATIONS_DIR"
  cat > "$APPLICATIONS_DIR/firefly.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Firefly
Comment=Local-first AI desktop companion
Exec="$ROOT_DIR/start_firefly.sh"
Path=$ROOT_DIR
Icon=$ROOT_DIR/figure/firefly2.png
Terminal=false
Categories=Utility;Office;
StartupNotify=true
StartupWMClass=Firefly
EOF
  chmod +x "$APPLICATIONS_DIR/firefly.desktop"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
  echo "[Firefly] Added Firefly to the desktop application menu."
fi

echo
echo "[Firefly] Installation complete."
echo "1. Put your API key in: $ROOT_DIR/.env"
echo "2. Start Firefly with: $ROOT_DIR/start_firefly.sh"
