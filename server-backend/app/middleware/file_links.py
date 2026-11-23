"""
Swaps file URLs at the API boundary (see app.core.file_access):
  - JSON responses: bucket URLs -> signed, expiring app links;
  - JSON request bodies: signed app links -> the stored bucket URL.

Pure ASGI (no BaseHTTPMiddleware) so streaming and background tasks behave as before. Only /api/v1/ JSON is
touched; the file-link endpoint itself and every non-JSON response pass straight through.
"""

from typing import Any, Dict, List, Tuple

from app.core.file_access import FILE_LINK_PATH, sign_bucket_urls, unsign_links

API_PREFIX = "/api/v1/"


def _header(headers: List[Tuple[bytes, bytes]], name: bytes) -> bytes:
    for k, v in headers:
        if k.lower() == name:
            return v
    return b""


def _base_url(scope: Dict[str, Any]) -> str:
    """The address the caller used to reach the API (honours a proxy's X-Forwarded-* headers)."""
    headers = scope.get("headers") or []
    proto = _header(headers, b"x-forwarded-proto").decode().split(",")[0].strip() or scope.get("scheme", "http")
    host = (_header(headers, b"x-forwarded-host") or _header(headers, b"host")).decode().split(",")[0].strip()
    if not host:
        server = scope.get("server") or ("localhost", 80)
        host = f"{server[0]}:{server[1]}"
    return f"{proto}://{host}"


class FileLinkMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if not path.startswith(API_PREFIX) or path.startswith(FILE_LINK_PATH):
            await self.app(scope, receive, send)
            return

        receive = await self._unsign_request(scope, receive)
        base_url = _base_url(scope)
        start: Dict[str, Any] = {}
        chunks: List[bytes] = []
        is_json = False

        async def send_wrapper(message):
            nonlocal is_json
            if message["type"] == "http.response.start":
                ctype = _header(message.get("headers", []), b"content-type")
                is_json = b"application/json" in ctype.lower()
                if not is_json:
                    await send(message)
                    return
                start.update(message)
                return
            if message["type"] == "http.response.body" and is_json:
                chunks.append(message.get("body", b""))
                if message.get("more_body"):
                    return
                body = b"".join(chunks)
                try:
                    text = body.decode("utf-8")
                    new_text = sign_bucket_urls(text, base_url)
                    if new_text is not text:
                        body = new_text.encode("utf-8")
                except UnicodeDecodeError:
                    pass
                headers = [(k, v) for k, v in start.get("headers", []) if k.lower() != b"content-length"]
                headers.append((b"content-length", str(len(body)).encode()))
                await send({**start, "headers": headers})
                await send({"type": "http.response.body", "body": body, "more_body": False})
                return
            await send(message)

        await self.app(scope, receive, send_wrapper)

    @staticmethod
    async def _unsign_request(scope, receive):
        if scope.get("method") not in ("POST", "PUT", "PATCH"):
            return receive
        ctype = _header(scope.get("headers") or [], b"content-type").lower()
        if b"application/json" not in ctype:
            return receive

        body = b""
        more = True
        while more:
            message = await receive()
            if message["type"] != "http.request":
                # Client went away: hand the message on untouched.
                async def passthrough(m=message):
                    return m
                return passthrough
            body += message.get("body", b"")
            more = message.get("more_body", False)

        if FILE_LINK_PATH.encode() in body:
            try:
                body = unsign_links(body.decode("utf-8")).encode("utf-8")
            except UnicodeDecodeError:
                pass

        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        return replay
