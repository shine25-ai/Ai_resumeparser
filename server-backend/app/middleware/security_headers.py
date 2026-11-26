"""
Security headers on API responses (Phase 12 security review).

- X-Content-Type-Options: nosniff     browsers never guess a JSON or file response is HTML or script
- X-Frame-Options: DENY / frame-ancestors 'none'   API responses are never shown inside another site's frame
- Referrer-Policy                     links in emails and files don't send full URLs (tokens) to other sites
- Cache-Control: no-store             signed-in data isn't kept by shared caches (unless the route set its own)
- Strict-Transport-Security           only on HTTPS (as the proxy reports it), so local HTTP keeps working

Only /api paths are touched: the frontend files and the careers page (which may be embedded) keep theirs.
"""

from typing import Any, Callable, Dict, List, Tuple

API_PREFIX = b"/api/"
PUBLIC_PREFIX = b"/api/v1/public/"

BASE_HEADERS: List[Tuple[bytes, bytes]] = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"content-security-policy", b"frame-ancestors 'none'"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
]
HSTS = (b"strict-transport-security", b"max-age=15552000; includeSubDomains")


class SecurityHeadersMiddleware:
    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Dict[str, Any], receive: Callable, send: Callable) -> None:
        path = scope.get("raw_path") or scope.get("path", "").encode()
        if scope.get("type") != "http" or not path.startswith(API_PREFIX):
            await self.app(scope, receive, send)
            return
        req = {k.lower(): v for k, v in scope.get("headers") or []}
        https = scope.get("scheme") == "https" or req.get(b"x-forwarded-proto", b"").split(b",")[0].strip() == b"https"
        public = path.startswith(PUBLIC_PREFIX)

        async def send_with_headers(message: Dict[str, Any]) -> None:
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers") or [])
                present = {k.lower() for k, _ in headers}
                for name, value in BASE_HEADERS:
                    if name not in present:
                        headers.append((name, value))
                if not public and b"cache-control" not in present:
                    headers.append((b"cache-control", b"no-store"))
                if https:
                    headers.append(HSTS)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
