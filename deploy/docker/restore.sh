#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f "$1" ]]; then
    echo "用法：$0 /path/to/firefly-data-YYYYmmdd-HHMMSS.tar.gz" >&2
    exit 1
fi

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export COMPOSE_ENV_FILES=$project_dir/deploy/docker/compose.env
archive=$(realpath "$1")
stamp=$(date +%Y%m%d-%H%M%S)
staging=$(mktemp -d)

tar -tzf "$archive" | grep -q '^data/' || { echo "备份中缺少 data/。" >&2; exit 1; }
tar -xzf "$archive" -C "$staging"

printf '将停止 Firefly，并用 %s 恢复数据。输入 RESTORE 继续：' "$archive"
read -r confirmation
[[ "$confirmation" == RESTORE ]] || { echo "已取消。"; exit 1; }

cd "$project_dir"
docker compose down
mkdir -p backups
if [[ -d data ]]; then
    mv data "backups/data-before-restore-$stamp"
fi
mv "$staging/data" data
if [[ -f "$staging/.env" ]]; then
    cp -p "$staging/.env" .env
fi
docker compose up -d
echo "恢复完成。旧数据保存在 backups/data-before-restore-$stamp"
