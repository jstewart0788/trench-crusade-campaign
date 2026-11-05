#!/usr/bin/env python3
"""Flag asset bundles whose shaders have no Metal program, so they may not draw in Tabletop Simulator on macOS.

TTS on Apple hardware renders with Metal. A bundle that packs its own copy of a
shader compiled only for Direct3D 11 and OpenGL Core cannot run that shader there:
Unity tries the shader's Fallback instead (looked up by name), and when the fallback
chain ends inside the bundle with no Metal program either, the object draws solid
magenta. Seen live on 2026-11-05: the Corpse props, whose bundle packs Mobile/Diffuse
and its fallback Mobile/VertexLit, both without Metal (Player.log: "Shader
Mobile/VertexLit shader is not supported on this GPU").

Verdicts, per bundle, over the materials its renderers draw with:
  ok        every shader lives outside the bundle (TTS's own) or has a Metal program
  fallback  a packed shader lacks Metal but its fallback chain leaves the bundle, so
            TTS draws it with its own shader of that name (no magenta seen; plainer look)
  magenta   a packed shader lacks Metal and so does every fallback, or it has none
  unknown   a packed shader whose program list this reader cannot find
  unchecked the bundle is not in TTS's cache, or does not parse

Reads bundles from TTS's local cache. Standard library only: the UnityFS container,
its LZ4 and LZMA blocks and the serialized object table are decoded here; shader
platforms and names are found by the layout of their fields, which holds for the
Unity 5.6 to 2019.4 bundles TTS loads.
"""

import argparse
import json
import lzma
import os
import re
import struct
import sys

DEFAULT_CACHE = "~/Library/Tabletop Simulator/Mods/Assetbundles"

# ShaderCompilerPlatform values a TTS bundle can carry.
PLATFORM_NAMES = {0: "OpenGL", 4: "D3D11", 5: "GLES20", 9: "GLES3", 14: "Metal", 15: "OpenGLCore", 18: "Vulkan"}
METAL = 14

CLASS_MATERIAL = 21
CLASS_SHADER = 48
RENDERER_CLASSES = {23, 137, 199}  # MeshRenderer, SkinnedMeshRenderer, ParticleSystemRenderer


class BundleError(Exception):
    pass


def cache_path(url, cache_dir):
    """TTS names a cached bundle after its URL with everything but letters and digits removed."""
    key = re.sub(r"[^A-Za-z0-9]", "", url)
    for name in (key + ".unity3d", key):
        path = os.path.join(cache_dir, name)
        if os.path.exists(path):
            return path
    return None


def lz4_block(src, size):
    dst = bytearray()
    i, n = 0, len(src)
    while i < n:
        token = src[i]
        i += 1
        lit = token >> 4
        if lit == 15:
            while True:
                b = src[i]
                i += 1
                lit += b
                if b != 255:
                    break
        dst += src[i:i + lit]
        i += lit
        if i >= n:
            break
        off = src[i] | (src[i + 1] << 8)
        i += 2
        length = token & 15
        if length == 15:
            while True:
                b = src[i]
                i += 1
                length += b
                if b != 255:
                    break
        length += 4
        start = len(dst) - off
        if off >= length:
            dst += dst[start:start + length]
        else:
            for k in range(length):
                dst.append(dst[start + k])
    return bytes(dst[:size])


def decompress(kind, data, size):
    if kind == 0:
        return data[:size]
    if kind == 1:
        props, dict_size = data[0], struct.unpack("<I", data[1:5])[0]
        lc, props = props % 9, props // 9
        lp, pb = props % 5, props // 5
        filters = [{"id": lzma.FILTER_LZMA1, "dict_size": dict_size, "lc": lc, "lp": lp, "pb": pb}]
        return lzma.decompress(data[5:], format=lzma.FORMAT_RAW, filters=filters)[:size]
    if kind in (2, 3):
        return lz4_block(data, size)
    raise BundleError("compression %d" % kind)


def read_serialized_files(path):
    """The Unity revision and the serialized files in a UnityFS bundle (resource streams skipped)."""
    with open(path, "rb") as fh:
        b = fh.read()
    if not b.startswith(b"UnityFS\0"):
        raise BundleError("not a UnityFS bundle")
    i = 8
    fmt = struct.unpack(">I", b[i:i + 4])[0]
    i += 4
    j = b.index(b"\0", i)
    i = j + 1
    j = b.index(b"\0", i)
    revision = b[i:j].decode("ascii", "replace")
    i = j + 1
    _size, csize, usize, flags = struct.unpack(">QIII", b[i:i + 20])
    i += 20
    if fmt >= 7:
        i = (i + 15) // 16 * 16
    if flags & 0x80:
        info = decompress(flags & 0x3F, b[-csize:], usize)
    else:
        info = decompress(flags & 0x3F, b[i:i + csize], usize)
        i += csize
    k = 16
    (nblocks,) = struct.unpack(">i", info[k:k + 4])
    k += 4
    blocks = []
    for _ in range(nblocks):
        u, c, f = struct.unpack(">IIH", info[k:k + 10])
        k += 10
        blocks.append((u, c, f))
    (nnodes,) = struct.unpack(">i", info[k:k + 4])
    k += 4
    nodes = []
    for _ in range(nnodes):
        off, sz, _fl = struct.unpack(">qqI", info[k:k + 20])
        k += 20
        e = info.index(b"\0", k)
        nodes.append((off, sz, info[k:e].decode("utf-8", "replace")))
        k = e + 1
    wanted = [n for n in nodes if not n[2].endswith((".resS", ".resource"))]
    need = max((off + sz for off, sz, _ in wanted), default=0)
    # Textures sit in the resource streams after the serialized files: stop decoding once those are covered.
    data = bytearray()
    for u, c, f in blocks:
        if len(data) >= need:
            break
        data += decompress(f & 0x3F, b[i:i + c], u)
        i += c
    return revision, [(name, bytes(data[off:off + sz])) for off, sz, name in wanted]


def object_table(blob):
    """Objects (pathID, classID, bytes) and external file paths of a serialized file, formats 17 to 21."""
    _meta, _fsize, version, data_offset = struct.unpack(">IIII", blob[:16])
    if not 17 <= version <= 21:
        raise BundleError("serialized format %d" % version)
    k = 20
    k = blob.index(b"\0", k) + 1
    k += 4  # target platform
    has_tree = blob[k]
    k += 1
    (ntypes,) = struct.unpack("<i", blob[k:k + 4])
    k += 4
    classes = []
    for _ in range(ntypes):
        cid, _stripped, _script = struct.unpack("<iBh", blob[k:k + 7])
        k += 7
        if cid == 114:
            k += 16
        k += 16
        if has_tree:
            nn, sbuf = struct.unpack("<ii", blob[k:k + 8])
            k += 8 + nn * (32 if version >= 19 else 24) + sbuf
            if version >= 21:
                (nd,) = struct.unpack("<i", blob[k:k + 4])
                k += 4 + 4 * nd
        classes.append(cid)
    (nobj,) = struct.unpack("<i", blob[k:k + 4])
    k += 4
    objects = []
    for _ in range(nobj):
        k = (k + 3) // 4 * 4
        pid, start, size, tid = struct.unpack("<qIIi", blob[k:k + 20])
        k += 20
        objects.append((pid, classes[tid], blob[data_offset + start:data_offset + start + size]))
    (nscript,) = struct.unpack("<i", blob[k:k + 4])
    k += 4
    for _ in range(nscript):
        k += 4
        k = (k + 3) // 4 * 4
        k += 8
    (next_,) = struct.unpack("<i", blob[k:k + 4])
    k += 4
    externals = []
    for _ in range(next_):
        k = blob.index(b"\0", k) + 1
        k += 20
        e = blob.index(b"\0", k)
        externals.append(blob[k:e].decode("utf-8", "replace"))
        k = e + 1
    return objects, externals


def u32(b, k):
    return struct.unpack("<I", b[k:k + 4])[0]


def shader_platforms(obj):
    """GPU platforms a packed Shader carries, or None when its program list is not found.

    2019.1 stores flat vectors platforms / offsets / compressedLengths / decompressedLengths
    followed by the blob; 2019.3 and later nest the last three per platform.
    """
    known = set(PLATFORM_NAMES)
    for k in range(0, len(obj) - 40, 4):
        n = u32(obj, k)
        if not 1 <= n <= 12:
            continue
        plats = [u32(obj, k + 4 + 4 * i) for i in range(n)]
        if not set(plats) <= known or len(set(plats)) != n:
            continue
        j = k + 4 + 4 * n
        if j + 4 > len(obj) or u32(obj, j) != n:
            continue
        offsets = [u32(obj, j + 4 + 4 * i) for i in range(n)]
        flat = j + 4 + 4 * n
        if offsets[0] == 0 and flat + 4 <= len(obj) and u32(obj, flat) == n:
            lengths = [u32(obj, flat + 4 + 4 * i) for i in range(n)]
            tail = flat + 4 + 4 * n
            if tail + 4 <= len(obj) and u32(obj, tail) == n:
                tail += 4 + 4 * n
                if tail + 4 <= len(obj) and u32(obj, tail) == sum(lengths):
                    return plats
    nested = None
    for k in range(0, len(obj) - 64, 4):
        n = u32(obj, k)
        if not 1 <= n <= 8:
            continue
        plats = [u32(obj, k + 4 + 4 * i) for i in range(n)]
        if not set(plats) <= known or len(set(plats)) != n:
            continue
        j = k + 4 + 4 * n
        if u32(obj, j) != n:
            continue
        inner = u32(obj, j + 4)
        if 1 <= inner <= 4 and u32(obj, j + 8) == 0:
            nested = plats
    return nested


def string_at(b, k):
    if k + 4 > len(b):
        return None, k
    (ln,) = struct.unpack("<i", b[k:k + 4])
    if not 0 <= ln <= 160 or k + 4 + ln > len(b):
        return None, k
    raw = b[k + 4:k + 4 + ln]
    if any(c < 0x20 or c > 0x7E for c in raw):
        return None, k
    return raw.decode("ascii"), (k + 4 + ln + 3) // 4 * 4


def shader_name_and_fallback(obj):
    """m_Name, m_CustomEditorName and m_FallbackName, followed by the dependency list, near the end of the parsed form."""
    hits = []
    for k in range(0, len(obj) - 16, 4):
        name, j = string_at(obj, k)
        if not name or len(name) < 3 or not name[0].isalpha():
            continue
        editor, j = string_at(obj, j)
        if editor is None:
            continue
        fallback, j = string_at(obj, j)
        if fallback is None or j + 4 > len(obj):
            continue
        (deps,) = struct.unpack("<i", obj[j:j + 4])
        if not 0 <= deps <= 16:
            continue
        jj, ok = j + 4, True
        for _ in range(deps):
            a, jj = string_at(obj, jj)
            c, jj2 = string_at(obj, jj)
            if a is None or c is None:
                ok = False
                break
            jj = jj2
        if ok:
            hits.append((k, name, fallback))
    if not hits:
        return None, None
    # The same run read one string late also fits; the run starts at the first hit of the last cluster.
    last = hits[-1][0]
    k, name, fallback = min(h for h in hits if last - h[0] <= 256)
    return name, fallback


def check_bundle(path):
    """Verdict for one cached bundle, with the materials that decided it."""
    revision, files = read_serialized_files(path)
    shaders = {}
    findings = []
    worst = "ok"
    rank = {"ok": 0, "fallback": 1, "unknown": 2, "magenta": 3}
    for _name, blob in files:
        objects, externals = object_table(blob)
        by_id = {pid: (cid, body) for pid, cid, body in objects}
        for pid, cid, body in objects:
            if cid == CLASS_SHADER:
                name, fallback = shader_name_and_fallback(body)
                shaders[pid] = {"name": name, "fallback": fallback, "platforms": shader_platforms(body)}
        by_name = {s["name"]: s for s in shaders.values() if s["name"]}
        materials = {}
        for pid, cid, body in objects:
            if cid != CLASS_MATERIAL:
                continue
            (ln,) = struct.unpack("<i", body[:4])
            mname = body[4:4 + ln].decode("utf-8", "replace")
            k = (4 + ln + 3) // 4 * 4
            fid, spid = struct.unpack("<iq", body[k:k + 12])
            materials[pid] = (mname, fid, spid)
        drawn = set()
        for pid, cid, body in objects:
            if cid in RENDERER_CLASSES:
                for mpid in materials:
                    if struct.pack("<iq", 0, mpid) in body:
                        drawn.add(mpid)
        for mpid in sorted(drawn):
            mname, fid, spid = materials[mpid]
            if fid != 0:
                where = externals[fid - 1] if 0 < fid <= len(externals) else "external"
                findings.append({"material": mname, "shader": where.split("/")[-1], "verdict": "ok"})
                continue
            shader = shaders.get(spid)
            if shader is None or by_id.get(spid, (None,))[0] != CLASS_SHADER:
                findings.append({"material": mname, "shader": None, "verdict": "unknown"})
                worst = max(worst, "unknown", key=rank.get)
                continue
            chain, verdict, seen = [], None, set()
            current = shader
            while verdict is None:
                chain.append(current["name"] or "?")
                plats = current["platforms"]
                if plats is None:
                    verdict = "unknown"
                elif METAL in plats:
                    verdict = "ok" if len(chain) == 1 else "fallback"
                else:
                    fb = current["fallback"]
                    if not fb or fb == "Off":
                        verdict = "magenta"
                    elif fb in by_name and fb not in seen:
                        seen.add(fb)
                        current = by_name[fb]
                    else:
                        chain.append(fb + " (TTS's own)")
                        verdict = "fallback"
            findings.append({
                "material": mname,
                "shader": " -> ".join(chain),
                "platforms": [PLATFORM_NAMES.get(p, str(p)) for p in (shader["platforms"] or [])],
                "verdict": verdict,
            })
            worst = max(worst, verdict, key=rank.get)
    return {"verdict": worst, "unity": revision, "materials": findings}


def check_urls(urls, cache_dir=DEFAULT_CACHE):
    """{url: result} for each bundle URL; never raises."""
    cache_dir = os.path.expanduser(cache_dir)
    out = {}
    for url in sorted(set(urls)):
        path = cache_path(url, cache_dir)
        if path is None:
            out[url] = {"verdict": "unchecked", "reason": "not in the TTS cache"}
            continue
        try:
            out[url] = check_bundle(path)
        except Exception as exc:  # a malformed or unfamiliar bundle is reported, not fatal
            out[url] = {"verdict": "unchecked", "reason": "%s: %s" % (type(exc).__name__, exc)}
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--catalog", default="data/tts/catalog.json")
    parser.add_argument("--palette", default="data/tts/palette.json")
    parser.add_argument("--all", action="store_true", help="every asset bundle in the catalog, not only the palette's")
    parser.add_argument("--include-disabled", action="store_true", help="also the palette pieces that are switched off")
    parser.add_argument("--cache", default=DEFAULT_CACHE)
    parser.add_argument("--json", action="store_true", help="print every result as JSON")
    parser.add_argument("--strict", action="store_true", help="exit 1 when a bundle would draw magenta")
    args = parser.parse_args(argv)

    with open(args.catalog, "r", encoding="utf-8") as fh:
        catalog = json.load(fh)
    assets = {a["id"]: a for a in catalog["assets"] if a["kind"] == "Custom_Assetbundle"}
    labels = {}
    if args.all:
        for a in assets.values():
            nick = a["nicknames"][0]["nickname"] if a["nicknames"] else ""
            labels.setdefault(a["urls"]["primary"], "%s %s" % (a["id"], nick))
    else:
        with open(args.palette, "r", encoding="utf-8") as fh:
            palette = json.load(fh)
        for piece in palette["pieces"]:
            if piece["assetId"] in assets and (piece.get("enabled", True) or args.include_disabled):
                url = assets[piece["assetId"]]["urls"]["primary"]
                labels[url] = labels.get(url, "") + ("," if url in labels else "") + piece["id"]

    results = check_urls(labels, args.cache)
    if args.json:
        print(json.dumps({labels[u]: r for u, r in results.items()}, indent=1, sort_keys=True))
    counts = {}
    for url in sorted(results, key=lambda u: labels[u]):
        r = results[url]
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
        if r["verdict"] == "ok" or args.json:
            continue
        detail = r.get("reason") or "; ".join("%s: %s" % (m["material"], m["shader"]) for m in r["materials"] if m["verdict"] != "ok")
        print("%-9s %s  [%s] %s" % (r["verdict"], labels[url], r.get("unity", ""), detail))
    print("checked %d bundles: %s" % (len(results), ", ".join("%s %d" % (k, counts[k]) for k in sorted(counts))), file=sys.stderr)
    return 1 if args.strict and counts.get("magenta") else 0


if __name__ == "__main__":
    sys.exit(main())
