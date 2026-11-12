#!/usr/bin/env python3
"""Draw the faces of the dice tray, the opponent's last-roll board and the Measure & Mark panel.

    python3 -I scripts/dice_tray_art.py           (writes the PNGs)
    python3 -I scripts/dice_tray_art.py --check   (exit 1 if the committed PNGs differ)

Flat colour blocks only: every text row on these tiles is a button with an opaque backing in
the colour under it (mod/scripts/acae21.lua), so the faces stay plain. Geometry is in inches in
the seated player's frame (u to their right, v toward them); image row 0 is the far edge and
column 0 the player's left. Served by the web app from apps/web/public/tts, so the mod loads
them from https://tc.rynfin.org/tts/. Standard library only.
"""

import os
import struct
import sys
import zlib

PPI = 32
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "web", "public", "tts")

MAT = (20, 20, 20)
PANEL = (31, 31, 31)
BAND = (12, 11, 11)
EDGE = (59, 53, 48)
RULE = (58, 54, 49)
BAND_RULE = (74, 58, 48)
NEUTRAL = (74, 71, 64)
SIDE = {"red": (140, 31, 31), "blue": (31, 77, 153)}

# Mirrors mod/scripts/acae21.lua (TRAY_HALF, READOUT, the strip band) and e24b01.lua.
TRAY = (14.3, 5.575)
READOUT = (-13.95, -7.6, -5.2, 3.35)
BOARD = (5.3, 5.575)
PANEL_TILE = (4.5, 3.8)


class Canvas:
    def __init__(self, hu, hv, fill):
        self.hu, self.hv = hu, hv
        self.w, self.h = round(2 * hu * PPI), round(2 * hv * PPI)
        self.rows = [bytearray(bytes(fill) * self.w) for _ in range(self.h)]

    def rect(self, u0, u1, v0, v1, colour):
        x0 = max(0, round((u0 + self.hu) * PPI))
        x1 = min(self.w, round((u1 + self.hu) * PPI))
        y0 = max(0, round((v0 + self.hv) * PPI))
        y1 = min(self.h, round((v1 + self.hv) * PPI))
        if x1 <= x0 or y1 <= y0:
            return
        run = bytes(colour) * (x1 - x0)
        for y in range(y0, y1):
            self.rows[y][x0 * 3:x1 * 3] = run

    def frame(self, u0, u1, v0, v1, width, colour):
        self.rect(u0, u1, v0, v0 + width, colour)
        self.rect(u0, u1, v1 - width, v1, colour)
        self.rect(u0, u0 + width, v0, v1, colour)
        self.rect(u1 - width, u1, v0, v1, colour)

    def png(self):
        raw = b"".join(b"\0" + bytes(r) for r in self.rows)

        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

        header = struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0)
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def tray(side):
    hu, hv = TRAY
    c = Canvas(hu, hv, MAT)
    c.frame(-hu, hu, -hv, hv, 0.12, SIDE[side])
    c.frame(-hu + 0.25, hu - 0.25, -hv + 0.25, hv - 0.25, 1 / PPI, EDGE)
    c.rect(-hu + 0.25, hu - 0.25, 3.75, hv - 0.25, BAND)
    c.rect(-hu + 0.5, hu - 0.5, 3.75, 3.75 + 1 / PPI, BAND_RULE)
    u0, u1, v0, v1 = READOUT
    c.rect(u0, u1, v0, v1, PANEL)
    c.frame(u0, u1, v0, v1, 1 / PPI, RULE)
    c.rect(u0 + 0.35, u1 - 0.35, 0.2, 0.2 + 1 / PPI, RULE)
    return c.png()


def board(side):
    hu, hv = BOARD
    c = Canvas(hu, hv, MAT)
    c.frame(-hu, hu, -hv, hv, 0.12, SIDE[side])
    c.rect(-hu + 0.5, hu - 0.5, 1.75, 1.75 + 1 / PPI, RULE)
    return c.png()


def measure():
    hu, hv = PANEL_TILE
    c = Canvas(hu, hv, MAT)
    c.frame(-hu, hu, -hv, hv, 0.06, NEUTRAL)
    return c.png()


IMAGES = {
    "dice-tray-red.png": lambda: tray("red"),
    "dice-tray-blue.png": lambda: tray("blue"),
    "roll-board-red.png": lambda: board("red"),
    "roll-board-blue.png": lambda: board("blue"),
    "measure-panel.png": measure,
}


def main(argv):
    check = "--check" in argv
    stale = []
    for name, draw in IMAGES.items():
        path = os.path.join(OUT_DIR, name)
        data = draw()
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
        print("stale: %s; run python3 -I scripts/dice_tray_art.py" % ", ".join(stale), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
