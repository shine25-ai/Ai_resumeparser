"""
CORS for the public careers endpoints (/api/v1/public/...).

The careers page can be embedded in any site or opened as a single HTML file straight from disk.
A file opened from disk sends "Origin: null", which the main CORS setup does not allow. These
endpoints need no login and no cookies, so they answer every origin with "*" and never allow
credentials. All other endpoints keep the main CORS rules.

Add this middleware last so it is the outermost layer and has the final say on these headers.
"""

from typing import Iterable, List, Tuple

PUBLIC_PREFIX = "/api/v1/public/"
DEFAULT_ALLOWED_HEADERS = b"content-type, x-applicant-token"
_CORS_RESPONSE_HEADERS = {b"access-control-allow-origin", b"access-control-allow-credentials"}


def _without_cors(headers: Iterable[Tuple[bytes, bytes]]) -> List[Tuple[bytes, bytes]]:
    return [(k, v) for k, v in headers if k.lower() not in _CORS_RESPONSE_HEADERS]


class PublicCorsMiddleware:
    def __init__(self, app, prefix: str = PUBLIC_PREFIX):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith(self.prefix):
            await self.app(scope, receive, send)
            return

        request_headers = {k.lower(): v for k, v in scope.get("headers", [])}

        # Preflight: answer here so any origin, including "null", may call these endpoints.
        if scope["method"] == "OPTIONS" and b"access-control-request-method" in request_headers:
            await send({
                "type": "http.response.start",
                "status": 204,
                "headers": [
                    (b"access-control-allow-origin", b"*"),
                    (b"access-control-allow-methods", b"GET, POST, OPTIONS"),
                    (b"access-control-allow-headers",
                     request_headers.get(b"access-control-request-headers") or DEFAULT_ALLOWED_HEADERS),
                    (b"access-control-max-age", b"600"),
                ],
            })
            await send({"type": "http.response.body", "body": b""})
            return

        async def send_with_cors(message):
            if message["type"] == "http.response.start":
                headers = _without_cors(message.get("headers", []))
                headers.append((b"access-control-allow-origin", b"*"))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_cors)
