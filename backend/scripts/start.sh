#!/usr/bin/env sh
# Render start command (single free web service): migrate, then run Daphne (HTTP + WebSockets) and a
# Celery worker with embedded beat in the same container. If either process exits, stop the other and
# exit non-zero so Render restarts the container.
set -eu

PORT="${PORT:-8000}"

python manage.py migrate --noinput

daphne -b 0.0.0.0 -p "$PORT" --proxy-headers config.asgi:application &
WEB_PID=$!

celery -A config worker -B --concurrency=1 --pool=solo -l info --schedule /tmp/celerybeat-schedule &
WORKER_PID=$!

shutdown() {
    kill -TERM "$WEB_PID" "$WORKER_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
}
trap 'shutdown; exit 0' TERM INT

while kill -0 "$WEB_PID" 2>/dev/null && kill -0 "$WORKER_PID" 2>/dev/null; do
    sleep 5
done

if kill -0 "$WEB_PID" 2>/dev/null; then
    echo "start.sh: celery worker exited; stopping daphne" >&2
else
    echo "start.sh: daphne exited; stopping celery worker" >&2
fi
shutdown
exit 1
