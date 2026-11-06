#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -x ".venv/bin/python" ]]; then
  exec .venv/bin/python run_firefly.py
fi

echo "Firefly has not been installed yet. Run ./install.sh first." >&2
exit 1
