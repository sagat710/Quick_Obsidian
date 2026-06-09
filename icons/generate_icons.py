#!/usr/bin/env python3
"""Generate PWA PNG icons with no third-party dependencies (stdlib zlib only).

Draws a rounded purple square with a simple white note/document glyph.
Regenerate with:  python3 icons/generate_icons.py
"""
import struct
import zlib
import os

# --- palette -------------------------------------------------------------
BG = (124, 58, 237)      # purple (#7c3aed)
BG2 = (109, 40, 217)     # darker purple for subtle gradient (#6d28d9)
FG = (255, 255, 255)     # white document
ACCENT = (196, 181, 253) # light purple lines (#c4b5fd)


def _rounded(x, y, w, h, r, px, py):
    """Return True if pixel (px,py) is inside a rounded rect."""
    if px < x or py < y or px >= x + w or py >= y + h:
        return False
    # corners
    cx = None
    cy = None
    if px < x + r and py < y + r:
        cx, cy = x + r, y + r
    elif px >= x + w - r and py < y + r:
        cx, cy = x + w - r, y + r
    elif px < x + r and py >= y + h - r:
        cx, cy = x + r, y + h - r
    elif px >= x + w - r and py >= y + h - r:
        cx, cy = x + w - r, y + h - r
    if cx is not None:
        return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    return True


def render(size):
    pixels = bytearray()
    s = size
    # document geometry
    doc_w = int(s * 0.46)
    doc_h = int(s * 0.56)
    doc_x = (s - doc_w) // 2
    doc_y = int(s * 0.22)
    doc_r = max(2, int(s * 0.04))
    # folded corner size
    fold = int(doc_w * 0.30)
    # text lines
    line_h = max(2, int(s * 0.022))
    line_gap = int(doc_h * 0.16)
    line_x0 = doc_x + int(doc_w * 0.16)
    line_x1 = doc_x + doc_w - int(doc_w * 0.16)
    first_line_y = doc_y + int(doc_h * 0.34)

    bg_r = int(s * 0.22)
    for y in range(s):
        for x in range(s):
            # default: transparent outside background
            inside_bg = _rounded(0, 0, s, s, bg_r, x, y)
            if not inside_bg:
                pixels += bytes((0, 0, 0, 0))
                continue
            # vertical gradient background
            t = y / s
            r = int(BG[0] * (1 - t) + BG2[0] * t)
            g = int(BG[1] * (1 - t) + BG2[1] * t)
            b = int(BG[2] * (1 - t) + BG2[2] * t)
            col = (r, g, b, 255)

            if _rounded(doc_x, doc_y, doc_w, doc_h, doc_r, x, y):
                # folded top-right corner -> show background (cut)
                rel_x = x - (doc_x + doc_w - fold)
                rel_y = (doc_y + fold) - y
                if rel_x >= 0 and rel_y >= 0 and rel_x + (fold - rel_y) >= fold:
                    # corner triangle: keep background (the cut)
                    pass
                else:
                    col = (FG[0], FG[1], FG[2], 255)
                    # draw note lines
                    for i in range(3):
                        ly = first_line_y + i * line_gap
                        lx1 = line_x1 if i < 2 else line_x0 + int((line_x1 - line_x0) * 0.55)
                        if ly <= y < ly + line_h and line_x0 <= x < lx1:
                            col = (ACCENT[0], ACCENT[1], ACCENT[2], 255)
            pixels += bytes(col)
    return bytes(pixels)


def write_png(path, size):
    raw = render(size)
    # add filter byte (0) per scanline
    stride = size * 4
    out = bytearray()
    for y in range(size):
        out.append(0)
        out += raw[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(out), 9)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        c += struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        return c

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({size}x{size}, {len(png)} bytes)")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    for sz in (192, 512, 180):
        write_png(os.path.join(here, f"icon-{sz}.png"), sz)
