#!/usr/bin/env bash
# Runs backup-to-s3.sh and emails the result (SUCCESS / FAILED) through an
# Amazon SNS topic. Cron calls this instead of backup-to-s3.sh directly.
#
# Needs SNS_TOPIC_ARN in /etc/backup-to-s3.conf and sns:Publish on that
# topic in the instance role's policy.
set -uo pipefail

CONF_FILE="${CONF_FILE:-/etc/backup-to-s3.conf}"
# shellcheck source=/dev/null
[ -f "$CONF_FILE" ] && . "$CONF_FILE"

: "${SNS_TOPIC_ARN:?SNS_TOPIC_ARN is not set (put it in $CONF_FILE)}"
LOG="${LOG:-/var/log/backup-to-s3.log}"
REGION="$(echo "$SNS_TOPIC_ARN" | cut -d: -f4)"
HOST="$(hostname -s)"

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

START="$(date +%s)"
CONF_FILE="$CONF_FILE" /usr/local/bin/backup-to-s3.sh >"$OUT" 2>&1
RC=$?
DURATION=$(( $(date +%s) - START ))
cat "$OUT" >> "$LOG"

if [ "$RC" -eq 0 ]; then STATUS="SUCCESS"; else STATUS="FAILED"; fi

MESSAGE="Backup ${STATUS} on ${HOST}

Time:      $(date -u '+%Y-%m-%d %H:%M:%S UTC')
Duration:  ${DURATION}s
Exit code: ${RC}
Bucket:    ${S3_BUCKET:-?}
$(grep -m1 'archive ' "$OUT" | sed 's/^\[[^]]*\] /Archive:   /')

Last lines of the log:
$(tail -n 15 "$OUT")"

if ! aws sns publish --region "$REGION" --topic-arn "$SNS_TOPIC_ARN" \
      --subject "[backup] ${STATUS} on ${HOST}" --message "$MESSAGE" >/dev/null 2>>"$LOG"; then
  echo "[$(date -u +%FT%TZ)] WARN: could not send SNS alert" >> "$LOG"
fi

exit "$RC"
