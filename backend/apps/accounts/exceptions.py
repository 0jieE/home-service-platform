"""Business-rule errors and the DRF exception handler that emits {"detail", "code"}."""

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler


class BusinessError(APIException):
    """Raise with a contract error code, e.g. BusinessError("...", "booking_conflict", 409)."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Request could not be completed."
    default_code = "error"

    def __init__(self, detail=None, code=None, status_code=None):
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail=detail, code=code)
        self.code = code or self.default_code


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    # Non-field errors ({"detail": "..."}) always carry a machine-readable code.
    if isinstance(data, dict) and "detail" in data and "code" not in data:
        code = getattr(exc, "code", None)
        if code is None and hasattr(exc, "get_codes"):
            codes = exc.get_codes()
            if isinstance(codes, str):
                code = codes
            elif isinstance(codes, dict) and isinstance(codes.get("detail"), str):
                code = codes["detail"]
        data["code"] = code or "error"
    return response
