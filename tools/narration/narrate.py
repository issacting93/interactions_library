#!/usr/bin/env python3
"""Synthesize narration audio from text using Kokoro (local, no API key).

Usage:
    tools/narration/.venv/bin/python tools/narration/narrate.py "Some line of narration." out.wav [voice]

Default voice is af_heart (American English). Run with no args for a smoke test.
"""
import sys
from pathlib import Path

import soundfile as sf
from kokoro import KPipeline

DEFAULT_VOICE = "af_heart"
SAMPLE_RATE = 24000


def narrate(text: str, out_path: str, voice: str = DEFAULT_VOICE) -> str:
    pipeline = KPipeline(lang_code="a")  # 'a' = American English
    chunks = []
    for _, _, audio in pipeline(text, voice=voice):
        chunks.append(audio)
    audio = chunks[0] if len(chunks) == 1 else __import__("numpy").concatenate(chunks)
    sf.write(out_path, audio, SAMPLE_RATE)
    return out_path


if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else (
        "The tide turns. A new ring opens, and the Maw grows."
    )
    out = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).parent / "test-output.wav")
    voice = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_VOICE
    path = narrate(text, out, voice)
    print(path)
