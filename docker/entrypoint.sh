#!/usr/bin/env bash
set -euo pipefail

PUID="${PUID:-10001}"
PGID="${PGID:-10001}"
CHOWN_MODE="${CHOWN_MODE:-auto}"
DATA_DIR="/app/data"

if ! [[ "$PUID" =~ ^[0-9]+$ ]]; then
  echo "[entrypoint] invalid PUID: $PUID" >&2
  exit 1
fi

if ! [[ "$PGID" =~ ^[0-9]+$ ]]; then
  echo "[entrypoint] invalid PGID: $PGID" >&2
  exit 1
fi

ensure_group() {
  local gid="$1"
  local group_name=""

  group_name="$(getent group "$gid" | cut -d: -f1 || true)"
  if [ -n "$group_name" ]; then
    echo "$group_name"
    return
  fi

  group_name="btshare"
  if getent group "$group_name" >/dev/null 2>&1; then
    group_name="btshare-${gid}"
  fi

  groupadd -g "$gid" "$group_name"
  echo "$group_name"
}

ensure_user() {
  local uid="$1"
  local gid="$2"
  local user_name=""

  user_name="$(getent passwd "$uid" | cut -d: -f1 || true)"
  if [ -n "$user_name" ]; then
    echo "$user_name"
    return
  fi

  user_name="btshare"
  if id -u "$user_name" >/dev/null 2>&1; then
    user_name="btshare-${uid}"
  fi

  useradd -u "$uid" -g "$gid" -M -N -s /usr/sbin/nologin "$user_name"
  echo "$user_name"
}

if [ "$CHOWN_MODE" = "auto" ]; then
  mkdir -p "$DATA_DIR"
  ownership_marker="$DATA_DIR/.ownership-fixed-${PUID}-${PGID}"
  if [ ! -f "$ownership_marker" ]; then
    echo "[entrypoint] fixing ownership for $DATA_DIR -> ${PUID}:${PGID}"
    chown -R "${PUID}:${PGID}" "$DATA_DIR"
    touch "$ownership_marker"
    chown "${PUID}:${PGID}" "$ownership_marker"
  fi
elif [ "$CHOWN_MODE" != "never" ]; then
  echo "[entrypoint] invalid CHOWN_MODE: $CHOWN_MODE (expected auto|never)" >&2
  exit 1
fi

if [ "$PUID" -eq 0 ] && [ "$PGID" -eq 0 ]; then
  exec "$@"
fi

group_name="$(ensure_group "$PGID")"
user_name="$(ensure_user "$PUID" "$PGID")"
echo "[entrypoint] running as ${user_name} (${PUID}:${PGID}, group=${group_name})"

exec gosu "${PUID}:${PGID}" "$@"
