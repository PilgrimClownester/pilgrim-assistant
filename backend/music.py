from collections.abc import Iterator
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException
from fastapi.responses import StreamingResponse


MUSIC_SOURCE_URL = "https://music.163.com/song/media/outer/url?id=1803814925.mp3"
FORWARDED_HEADERS = ("content-length", "content-range", "accept-ranges", "etag", "last-modified")


def stream_ambient_music(range_header: str | None = None) -> StreamingResponse:
    headers = {
        "User-Agent": "Mozilla/5.0 Firefly/1.0",
        "Referer": "https://music.163.com/",
    }
    if range_header:
        headers["Range"] = range_header

    try:
        upstream = urlopen(Request(MUSIC_SOURCE_URL, headers=headers), timeout=20)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="音乐暂时无法加载") from exc

    response_headers = {
        name.title(): value
        for name in FORWARDED_HEADERS
        if (value := upstream.headers.get(name))
    }
    response_headers["Cache-Control"] = "private, max-age=3600"

    def chunks() -> Iterator[bytes]:
        try:
            while chunk := upstream.read(64 * 1024):
                yield chunk
        finally:
            upstream.close()

    return StreamingResponse(
        chunks(),
        status_code=getattr(upstream, "status", 200),
        media_type=upstream.headers.get_content_type() or "audio/mpeg",
        headers=response_headers,
    )
