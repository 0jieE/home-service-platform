"""ASGI entrypoint: HTTP via Django, WebSocket via Channels (/ws/bookings/)."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402

from apps.bookings.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # Auth is the ?token= JWT checked in the consumer; origins limited to the frontend.
        "websocket": OriginValidator(
            URLRouter(websocket_urlpatterns),
            list(settings.CORS_ALLOWED_ORIGINS) + ["http://localhost:8000", "http://127.0.0.1:8000"],
        ),
    }
)
