#!/usr/bin/env python3
"""Transcribe founder walkthrough audio with OpenAI without printing credentials."""
from __future__ import annotations
import json
import mimetypes
import os
import sys
from pathlib import Path
from urllib import request
import uuid

PROFILE_ENV = Path.home() / ".hermes/profiles/unite/.env"


def load_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    if PROFILE_ENV.exists():
        for line in PROFILE_ENV.read_text(errors="ignore").splitlines():
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    raise RuntimeError("OPENAI_API_KEY not found")


def multipart(fields: dict[str, str], file_field: str, path: Path) -> tuple[bytes, str]:
    boundary = f"----Hermes{uuid.uuid4().hex}"
    parts: list[bytes] = []
    for name, value in fields.items():
        parts += [
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(), b"\r\n",
        ]
    mime = mimetypes.guess_type(path.name)[0] or "audio/mp4"
    parts += [
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="{file_field}"; filename="{path.name}"\r\n'.encode(),
        f"Content-Type: {mime}\r\n\r\n".encode(),
        path.read_bytes(), b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts), boundary


def transcribe(src: Path, dst: Path) -> None:
    body, boundary = multipart({
        "model": "gpt-4o-transcribe",
        "response_format": "json",
        "prompt": "This is a business operations walkthrough about Unite Medical. Preserve details about vendor offers, RFQs, quote validity, partner APIs, landed cost, margin floors, internal cost visibility, salesperson permissions, purchase-order drafting/review/sending, vendor acknowledgment links, email open/click tracking, Customer.io, warehouse receiving against POs, shortages, partial shipments, vendor bills, short payment, QBO, WMS roles, RMAs, payments, shipping, LTL freight, and customer account ownership.",
    }, "file", src)
    req = request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {load_key()}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with request.urlopen(req, timeout=600) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        detail = getattr(exc, "read", lambda: b"")()
        raise RuntimeError(f"Transcription failed: {getattr(exc, 'code', '')} {detail[:1000]!r}") from exc
    text = payload.get("text", "").strip()
    if not text:
        raise RuntimeError(f"No transcript returned for {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text + "\n")
    print(f"WROTE {dst} ({len(text)} chars)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: transcribe_walkthrough_audio.py INPUT OUTPUT")
    transcribe(Path(sys.argv[1]).expanduser(), Path(sys.argv[2]).expanduser())
