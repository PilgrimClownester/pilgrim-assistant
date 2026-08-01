#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$project_dir"
export COMPOSE_ENV_FILES=deploy/docker/compose.env

if [[ ! -f .env ]]; then
    echo "缺少 .env：请先从 .env.example 创建并填写服务器配置。" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "需要 Docker Engine 与 Compose v2。" >&2
    exit 1
fi

mkdir -p data backups/docker
export FIREFLY_UID=${FIREFLY_UID:-$(id -u)}
export FIREFLY_GID=${FIREFLY_GID:-$(id -g)}

docker compose config --quiet
docker compose build --pull
docker compose up -d --remove-orphans
docker compose ps

for _ in $(seq 1 30); do
    if curl -fsS "http://${FIREFLY_HTTP_BIND:-127.0.0.1}:${FIREFLY_HTTP_PORT:-18080}/api/health" >/dev/null; then
        echo "Firefly Docker 已就绪：http://${FIREFLY_HTTP_BIND:-127.0.0.1}:${FIREFLY_HTTP_PORT:-18080}"
        exit 0
    fi
    sleep 2
done

echo "健康检查超时，请执行 docker compose logs --tail=200。" >&2
exit 1
