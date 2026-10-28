"""WebSocket /ws/bookings/?token=<access>: pushes booking.updated events to participants."""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import AccessToken

CLOSE_UNAUTHORIZED = 4401
ADMINS_GROUP = "admins"


def user_group(user_id: int) -> str:
    return f"user_{user_id}"


@database_sync_to_async
def _user_from_token(raw: str):
    try:
        token = AccessToken(raw)
    except TokenError:
        return None
    User = get_user_model()
    user = User.objects.filter(pk=token.get(api_settings.USER_ID_CLAIM)).first()
    if user is None or not user.is_active:
        return None
    return user


class BookingConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode())
        raw = (query.get("token") or [""])[0]
        user = await _user_from_token(raw) if raw else None
        # Accept first so the client receives the 4401 close code (a pre-accept close is a bare 403).
        await self.accept()
        if user is None:
            await self.close(code=CLOSE_UNAUTHORIZED)
            return
        self.user = user
        self.groups_joined = [user_group(user.id)]
        if user.role == "admin":
            self.groups_joined.append(ADMINS_GROUP)
        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.send_json({"type": "connection.ready", "user_id": user.id, "role": user.role})

    async def disconnect(self, code):
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def booking_updated(self, event):
        await self.send_json(event["payload"])
