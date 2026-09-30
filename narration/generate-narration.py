#!/usr/bin/env python3
"""Generates the pre-rendered Play All narration clips from narration/manifest.json using
edge-tts (Microsoft's free neural voices — the same engine behind Edge's Read Aloud feature,
no API key required). Re-run this after `node build-manifest.mjs` whenever scenario copy in
index.html changes, so the offline audio stays in sync with the on-screen text.

Usage:
    pip install --user edge-tts
    python3 narration/generate-narration.py
"""
import asyncio
import json
import pathlib

import edge_tts

HERE = pathlib.Path(__file__).parent
MANIFEST_PATH = HERE / "manifest.json"


async def generate_clip(text: str, voice: str, out_path: pathlib.Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(out_path))
    print(f"  wrote {out_path.relative_to(HERE)}")


async def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for scenario in manifest:
        scenario_id = scenario["id"]
        print(f"{scenario_id}:")
        for clip in scenario["clips"]:
            out_path = HERE / scenario_id / f"{clip['kind']}.mp3"
            if out_path.exists() and out_path.stat().st_size > 0:
                print(f"  skip {out_path.relative_to(HERE)} (already exists)")
                continue
            # The hosted TTS endpoint occasionally hiccups (DNS/connection reset); retry a few times.
            for attempt in range(1, 4):
                try:
                    await generate_clip(clip["text"], clip["voice"], out_path)
                    break
                except Exception as exc:  # noqa: BLE001 - best effort retry for a flaky network call
                    print(f"  attempt {attempt} failed for {out_path.name}: {exc}")
                    if attempt == 3:
                        raise
                    await asyncio.sleep(2 * attempt)


if __name__ == "__main__":
    asyncio.run(main())
