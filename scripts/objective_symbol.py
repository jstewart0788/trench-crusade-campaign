#!/usr/bin/env python3
"""Draw the objective symbol the TTS mod shows: four wedges pointing in from a ring at a central lozenge.

    python3 -I scripts/objective_symbol.py           (writes the PNGs)
    python3 -I scripts/objective_symbol.py --check   (exit 1 if the committed PNGs differ)

objective-symbol.png is the emblem alone on transparency (the decal on a terrain piece that
covers an objective); objective-marker.png is the face of the 40mm marker disc, the emblem on
a dark iron ground. Both are served by the web app from apps/web/public/tts, so the mod loads
them from https://tc.rynfin.org/tts/. Standard library only.
"""

import math
import os
import struct
import sys
import zlib

SIZE = 512
SAMPLES = 3
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "web", "public", "tts")

BONE = (236, 226, 200)
INK = (26, 20, 16)
IRON = (46, 42, 38)
GREEN = (90, 230, 115)

# Image units: the image spans -1..1 on both axes.
RING_IN, RING_OUT = 0.76, 0.93
WEDGE_BASE, WEDGE_TIP, WEDGE_HALF = 0.80, 0.34, 0.21
DIAMOND = 0.19
STROKE = 0.045


def in_emblem(x, y, grow=0.0):
    r = math.hypot(x, y)
    if RING_IN - grow <= r <= RING_OUT + grow:
        return True
    if abs(x) + abs(y) <= DIAMOND + grow * math.sqrt(2):
        return True
    along, across = max(abs(x), abs(y)), min(abs(x), abs(y))
    if along < WEDGE_TIP - grow * 2 or along > WEDGE_BASE:
        return False
    return across <= WEDGE_HALF * (along - WEDGE_TIP) / (WEDGE_BASE - WEDGE_TIP) + grow * 1.6


def colour_at(x, y, ground):
    if in_emblem(x, y):
        return BONE + (255,)
    if in_emblem(x, y, STROKE):
        return INK + (255,)
    r = math.hypot(x, y)
    if ground and r <= 1.0:
        if r >= 0.965:
            return GREEN + (255,)
        return IRON + (255,)
    return (0, 0, 0, 0)


def render(ground):
    rows = []
    step = 2.0 / SIZE
    for j in range(SIZE):
        row = bytearray([0])
        for i in range(SIZE):
            acc = [0, 0, 0, 0]
            for sj in range(SAMPLES):
                for si in range(SAMPLES):
                    x = -1 + (i + (si + 0.5) / SAMPLES) * step
                    y = 1 - (j + (sj + 0.5) / SAMPLES) * step
                    c = colour_at(x, y, ground)
                    acc[0] += c[0] * c[3]
                    acc[1] += c[1] * c[3]
                    acc[2] += c[2] * c[3]
                    acc[3] += c[3]
            alpha = acc[3]
            if alpha == 0:
                row += b"\0\0\0\0"
            else:
                row += bytes((round(acc[0] / alpha), round(acc[1] / alpha), round(acc[2] / alpha), round(alpha / SAMPLES ** 2)))
        rows.append(bytes(row))
    return png(b"".join(rows))


def png(raw):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main(argv):
    check = "--check" in argv
    stale = []
    for name, ground in (("objective-symbol.png", False), ("objective-marker.png", True)):
        path = os.path.join(OUT_DIR, name)
        data = render(ground)
        if check:
            try:
                with open(path, "rb") as f:
                    if f.read() != data:
                        stale.append(name)
            except FileNotFoundError:
                stale.append(name)
        else:
            os.makedirs(OUT_DIR, exist_ok=True)
            with open(path, "wb") as f:
                f.write(data)
            print("wrote %s (%d bytes)" % (os.path.relpath(path), len(data)))
    if stale:
        print("stale: %s; run python3 -I scripts/objective_symbol.py" % ", ".join(stale), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
