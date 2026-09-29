#!/usr/bin/env bash
# Daily backup of the deployment server to S3.
#
# Archives the app deploy directory (compose file + .env), a pg_dump of every
# PostgreSQL container in the stack (login portal DB), and every other Docker
# named volume (TLS certs, acme state, ...), then uploads a single
# timestamped tarball to s3://$S3_BUCKET/$S3_PREFIX/<host>/.
#
# Meant to be run by cron (see ansible/playbook-backup.yml), but safe to run
# by hand:  sudo /usr/local/bin/backup-to-s3.sh
#
# Config comes from /etc/backup-to-s3.conf (or env vars):
#   S3_BUCKET        required, bucket name only (no s3://)
#   S3_PREFIX        key prefix inside the bucket            (default: backups)
#   BACKUP_PATHS     space-separated dirs/files to archive   (default: /opt/devops-microservices-demo)
#   DOCKER_VOLUMES   space-separated volume names, or "auto" (default: auto = all volumes of the compose project)
#   COMPOSE_PROJECT  compose project name used by "auto"     (default: devops-microservices-demo)
#   DB_CONTAINERS    space-separated postgres containers to dump, or "auto" (default: auto)
#   LOCAL_DIR        where the tarball is staged             (default: /var/backups/s3-staging)
#   LOCAL_KEEP_DAYS  days to keep local copies               (default: 3)
#   STORAGE_CLASS    S3 storage class                        (default: STANDARD_IA)
#
# AWS credentials: prefer an EC2 instance role with s3:PutObject on the
# bucket. Falls back to whatever the AWS CLI finds (~/.aws, env vars).
set -euo pipefail

CONF_FILE="${CONF_FILE:-/etc/backup-to-s3.conf}"
# shellcheck source=/dev/null
[ -f "$CONF_FILE" ] && . "$CONF_FILE"

: "${S3_BUCKET:?S3_BUCKET is not set (put it in $CONF_FILE)}"
S3_PREFIX="${S3_PREFIX:-backups}"
BACKUP_PATHS="${BACKUP_PATHS:-/opt/devops-microservices-demo}"
DOCKER_VOLUMES="${DOCKER_VOLUMES:-auto}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-devops-microservices-demo}"
DB_CONTAINERS="${DB_CONTAINERS:-auto}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/s3-staging}"
LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-3}"
STORAGE_CLASS="${STORAGE_CLASS:-STANDARD_IA}"

HOST="$(hostname -s)"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
ARCHIVE="$LOCAL_DIR/${HOST}-${STAMP}.tar.gz"
S3_URI="s3://${S3_BUCKET}/${S3_PREFIX}/${HOST}/$(date -u +%Y/%m)/$(basename "$ARCHIVE")"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

# Only one backup at a time (cron + manual run overlap).
exec 9>/var/lock/backup-to-s3.lock
flock -n 9 || { log "another backup is already running, exiting"; exit 0; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$LOCAL_DIR" "$WORK/files" "$WORK/volumes" "$WORK/databases"

# 1. Plain files/directories
for p in $BACKUP_PATHS; do
  if [ -e "$p" ]; then
    log "adding path $p"
    tar -C / -czf "$WORK/files/$(echo "${p#/}" | tr '/' '_').tar.gz" "${p#/}"
  else
    log "WARN: path $p does not exist, skipping"
  fi
done

# 2. Databases: a pg_dump is a consistent snapshot even while the DB is in
#    use; a raw copy of a live data directory may not restore.
DB_VOLUMES=""
if command -v docker >/dev/null 2>&1; then
  if [ "$DB_CONTAINERS" = "auto" ]; then
    DB_CONTAINERS="$(docker ps --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" \
      --format '{{.Names}} {{.Image}}' | awk '$2 ~ /postgres/ {print $1}' | tr '\n' ' ')"
  fi
  for c in $DB_CONTAINERS; do
    log "dumping database container $c"
    docker exec "$c" sh -c 'pg_dumpall -U "$POSTGRES_USER"' | gzip > "$WORK/databases/${c}.sql.gz"
    DB_VOLUMES="$DB_VOLUMES $(docker inspect -f '{{range .Mounts}}{{.Name}} {{end}}' "$c")"
  done
fi

# 3. Other Docker named volumes (exported through a throwaway container so
#    we don't depend on /var/lib/docker layout). Database volumes are
#    skipped: they are covered by the dump above.
if command -v docker >/dev/null 2>&1; then
  if [ "$DOCKER_VOLUMES" = "auto" ]; then
    DOCKER_VOLUMES="$(docker volume ls -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" | tr '\n' ' ')"
  fi
  for v in $DOCKER_VOLUMES; do
    case " $DB_VOLUMES " in *" $v "*) log "skipping database volume $v (dumped above)"; continue ;; esac
    log "adding docker volume $v"
    docker run --rm -v "$v":/data:ro -v "$WORK/volumes":/out alpine \
      tar -C /data -czf "/out/${v}.tar.gz" .
  done
else
  log "docker not found, skipping databases and volumes"
fi

# 4. Bundle + upload
tar -C "$WORK" -czf "$ARCHIVE" files databases volumes
log "archive $(du -h "$ARCHIVE" | cut -f1) -> $S3_URI"
aws s3 cp "$ARCHIVE" "$S3_URI" --only-show-errors --storage-class "$STORAGE_CLASS"
log "upload OK"

# 5. Local retention (S3 retention is handled by a bucket lifecycle rule)
find "$LOCAL_DIR" -name "${HOST}-*.tar.gz" -mtime +"$LOCAL_KEEP_DAYS" -delete
log "done"
