#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export COMPOSE_ENV_FILES=$project_dir/deploy/docker/compose.env
backup_dir=${FIREFLY_BACKUP_DIR:-$project_dir/backups/docker}
stamp=$(date +%Y%m%d-%H%M%S)
archive=$backup_dir/firefly-data-$stamp.tar.gz

mkdir -p "$backup_dir"
cd "$project_dir"
umask 077

api_was_running=false
if docker compose ps --status running --services 2>/dev/null | grep -qx api; then
    api_was_running=true
    docker compose stop -t 30 api
fi

restart_api() {
    if [[ "$api_was_running" == true ]]; then
        docker compose up -d --wait --wait-timeout 60 api >/dev/null
    fi
}
trap restart_api EXIT

tar -czf "$archive" data .env compose.yaml
find "$backup_dir" -type f -name 'firefly-data-*.tar.gz' -mtime +14 -delete
echo "$archive"
