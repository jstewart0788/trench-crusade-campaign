#!/usr/bin/env python3
"""Harvest reusable terrain assets from locally cached Tabletop Simulator workshop saves.

Walks the ObjectStates tree of each configured workshop mod, dedupes assets by primary
URL + scale, derives rest heights from the mods known to be seated correctly on the
table, and writes a JSON catalog plus a Markdown summary.

Standard library only. Deterministic: every collection is sorted before output.
"""

import argparse
import hashlib
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict

ROLE_TCMAP = "tcmap"
ROLE_REFERENCE = "reference"
ROLE_LAYOUT = "layout"
ROLE_MODELS = "models"

MODS = [
    ("3427166914", "Trench Crusade: Map", ROLE_TCMAP),
    ("3321247064", "Trenches Square Off", ROLE_REFERENCE),
    ("3347913885", "Urban Brawl", ROLE_REFERENCE),
    ("3665398498", "Armoured Train #1", ROLE_REFERENCE),
    ("3450016714", "The Cenotaph", ROLE_LAYOUT),
    ("3449196567", "Howitzers", ROLE_LAYOUT),
    ("3451328878", "Damji Airbase", ROLE_LAYOUT),
    ("3468858688", "Ruins 1", ROLE_LAYOUT),
    ("3661430094", "Relic Hunt #1", ROLE_LAYOUT),
    ("3661431659", "Supply Raid #1", ROLE_LAYOUT),
    ("3661436557", "The High Ground #1", ROLE_LAYOUT),
    ("3679630609", "Claim No Man's Land #2", ROLE_LAYOUT),
    ("3680187918", "Trench Warfare #1", ROLE_LAYOUT),
    ("3746379643", "Relic Hunt #2", ROLE_LAYOUT),
    ("3778062166", "Hunt for Heroes #2", ROLE_LAYOUT),
    ("3788909783", "Adepticon 2026", ROLE_LAYOUT),
    ("3603166284", "Scripted Table 1.0.2", ROLE_MODELS),
    ("3700111403", "Gannel's Model Corner", ROLE_MODELS),
    ("3137407072", "ForceOrg", ROLE_MODELS),
]

TCMAP_ID = "3427166914"
STASH_FLOOR = -50.0
UPRIGHT_TOLERANCE_DEG = 2.0
UNSTABLE_SPREAD = 0.3
DESCRIPTION_MAX = 200

TERRAIN_KINDS = {
    "Custom_Assetbundle",
    "Custom_Model",
    "Custom_Model_Bag",
    "Custom_Model_Infinite_Bag",
    "Custom_Token",
    "Custom_Tile",
    "Custom_Board",
}

BAG_KINDS = {"Bag", "Custom_Model_Bag", "Infinite_Bag", "Custom_Model_Infinite_Bag"}

TAG_VOCABULARY = [
    "trench", "trench-straight", "trench-corner", "trench-end", "ledge", "landscape",
    "hill", "ramp", "ruin", "wall", "building", "floor", "plank", "barbed-wire",
    "sandbag", "crater", "river", "swamp", "bridge", "crate", "barrel", "scaffold",
    "gun", "vehicle", "train", "tree", "rock", "rubble", "debris", "blood", "skull",
    "cross", "candle", "lamp", "fence", "ladder", "stairs", "tower", "bunker", "token",
    "difficult", "dangerous", "objective", "deployment", "text", "dice", "hand",
]

SIZE_HINT_RE = re.compile(r"\b(h?)(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\b", re.IGNORECASE)


def tag_pattern(tag):
    # "barbed-wire" matches "barbed wire", "barbed-wire" and "barbedwire"; plural "s" allowed.
    words = [re.escape(w) for w in tag.split("-")]
    return re.compile(r"\b" + r"[\s_-]?".join(words) + r"(?:s|es)?\b", re.IGNORECASE)


TAG_PATTERNS = [(tag, tag_pattern(tag)) for tag in TAG_VOCABULARY]


def derive_tags(nicknames):
    tags = set()
    for nick in nicknames:
        for tag, pat in TAG_PATTERNS:
            if pat.search(nick):
                tags.add(tag)
    return sorted(tags)


def derive_size_hints(nicknames):
    hints = set()
    for nick in nicknames:
        for prefix, a, b in SIZE_HINT_RE.findall(nick):
            hints.add("%s%sx%s" % (prefix.upper(), a, b))
    return sorted(hints)


def r2(value):
    out = round(float(value), 2)
    return 0.0 if out == 0 else out


def r3(value):
    out = round(float(value), 3)
    return 0.0 if out == 0 else out


def primary_url(obj):
    kind = obj.get("Name", "")
    if kind == "Custom_Assetbundle":
        return (obj.get("CustomAssetbundle") or {}).get("AssetbundleURL") or ""
    if kind in ("Custom_Model", "Custom_Model_Bag", "Custom_Model_Infinite_Bag"):
        return (obj.get("CustomMesh") or {}).get("MeshURL") or ""
    if kind in ("Custom_Token", "Custom_Tile", "Custom_Board"):
        return (obj.get("CustomImage") or {}).get("ImageURL") or ""
    return ""


def all_urls(obj):
    mesh = obj.get("CustomMesh") or {}
    bundle = obj.get("CustomAssetbundle") or {}
    image = obj.get("CustomImage") or {}
    return {
        "primary": primary_url(obj),
        "diffuse": mesh.get("DiffuseURL") or "",
        "normal": mesh.get("NormalURL") or "",
        "collider": mesh.get("ColliderURL") or "",
        "secondary": bundle.get("AssetbundleSecondaryURL") or image.get("ImageSecondaryURL") or "",
    }


def scale_of(obj):
    t = obj.get("Transform") or {}
    return [r2(t.get("scaleX", 1.0)), r2(t.get("scaleY", 1.0)), r2(t.get("scaleZ", 1.0))]


def asset_id(url, scale):
    key = "%s|%.2f|%.2f|%.2f" % (url, scale[0], scale[1], scale[2])
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def url_key(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]


def is_upright(rot_x, rot_z):
    def near_flat(deg):
        deg = deg % 360.0
        return min(deg, 360.0 - deg) <= UPRIGHT_TOLERANCE_DEG or abs(deg - 180.0) <= UPRIGHT_TOLERANCE_DEG

    return near_flat(rot_x) and near_flat(rot_z)


def walk(objects, depth=0, container=None, via=None):
    """Yield (obj, depth, container_nickname, via) for every object in the tree.

    via is None for top-level objects, "contained" for bag contents, "child" for attached
    ChildObjects. Only top-level objects carry a trustworthy world transform: bag contents
    keep the position they had when bagged and ChildObjects are stored parent-relative.
    """
    for obj in objects or []:
        yield obj, depth, container, via
        nick = obj.get("Nickname") or ""
        for child in walk(obj.get("ContainedObjects"), depth + 1, nick, "contained"):
            yield child
        for child in walk(obj.get("ChildObjects"), depth + 1, nick, "child"):
            yield child


def color_key(obj):
    c = obj.get("ColorDiffuse")
    if not isinstance(c, dict):
        return None
    parts = [r3(c.get("r", 1.0)), r3(c.get("g", 1.0)), r3(c.get("b", 1.0))]
    if "a" in c:
        parts.append(r3(c["a"]))
    return tuple(parts)


def load_save(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


class AssetAccumulator:
    def __init__(self, kind, urls, scale):
        self.kind = kind
        self.urls = urls
        self.scale = scale
        self.nicknames = Counter()
        self.descriptions = set()
        self.colors = Counter()
        self.source_counts = Counter()
        self.max_depth = 0
        self.containers = Counter()
        self.ref_obs = defaultdict(list)
        self.layout_pos_y = defaultdict(list)
        self.tcmap_pos_y = []

    def observe(self, obj, mod_id, role, depth, container, via):
        self.nicknames[obj.get("Nickname") or ""] += 1
        desc = (obj.get("Description") or "").strip()
        if desc:
            self.descriptions.add(desc[:DESCRIPTION_MAX])
        ck = color_key(obj)
        if ck is not None:
            self.colors[ck] += 1
        self.source_counts[mod_id] += 1
        self.max_depth = max(self.max_depth, depth)
        if container is not None:
            self.containers["%s:%s" % (via, container)] += 1
        if via is not None:
            return
        t = obj.get("Transform") or {}
        pos_y = float(t.get("posY", 0.0))
        if pos_y < STASH_FLOOR:
            return
        if role == ROLE_REFERENCE:
            self.ref_obs[mod_id].append({
                "posY": r2(pos_y),
                "rotX": r2(t.get("rotX", 0.0)),
                "rotZ": r2(t.get("rotZ", 0.0)),
            })
        elif role == ROLE_LAYOUT:
            self.layout_pos_y[mod_id].append(r2(pos_y))
        elif role == ROLE_TCMAP:
            self.tcmap_pos_y.append(r2(pos_y))


def build_entry(aid, acc, mod_names):
    upright = []
    sources = []
    for mod_id in sorted(acc.ref_obs):
        ys = [o["posY"] for o in acc.ref_obs[mod_id] if is_upright(o["rotX"], o["rotZ"])]
        if ys:
            upright.extend(ys)
            sources.append(mod_id)
    rest = None
    rest_min = None
    spread = None
    unstable = False
    if upright:
        rest = r2(statistics.median(upright))
        rest_min = r2(min(upright))
        spread = r2(max(upright) - min(upright))
        unstable = spread > UNSTABLE_SPREAD
    nicknames = sorted(acc.nicknames.items(), key=lambda kv: (-kv[1], kv[0]))
    color = None
    if acc.colors:
        color = list(sorted(acc.colors.items(), key=lambda kv: (-kv[1], kv[0]))[0][0])
    entry = {
        "id": aid,
        "kind": acc.kind,
        "urlKey": url_key(acc.urls["primary"]),
        "urls": acc.urls,
        "scale": acc.scale,
        "nicknames": [{"nickname": n, "count": c} for n, c in nicknames],
        "descriptions": sorted(acc.descriptions),
        "colorDiffuse": color,
        "sourceMods": [
            {"modId": m, "modName": mod_names[m], "count": acc.source_counts[m]}
            for m in sorted(acc.source_counts)
        ],
        "maxDepth": acc.max_depth,
        "containers": [
            {"container": k, "count": v}
            for k, v in sorted(acc.containers.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "observations": {
            m: sorted(acc.ref_obs[m], key=lambda o: (o["posY"], o["rotX"], o["rotZ"]))
            for m in sorted(acc.ref_obs)
        },
        "layoutPosY": {m: sorted(acc.layout_pos_y[m]) for m in sorted(acc.layout_pos_y)},
        "restHeight": rest,
        "restHeightSource": sources,
        "restHeightSpread": spread,
        "restHeightMin": rest_min,
        "unstable": unstable,
        "tcMapPosY": sorted(acc.tcmap_pos_y),
        "tags": derive_tags([n for n, _ in nicknames]),
        "sizeHint": derive_size_hints([n for n, _ in nicknames]),
    }
    return entry


def harvest_models(save):
    """Group model-mod contents by bag nickname (faction) -> contained objects."""
    groups = defaultdict(list)

    def record(obj, group):
        kind = obj.get("Name", "")
        if kind not in TERRAIN_KINDS:
            return
        url = primary_url(obj)
        if not url:
            return
        urls = all_urls(obj)
        groups[group].append({
            "nickname": obj.get("Nickname") or "",
            "kind": kind,
            "meshUrl": url,
            "diffuseUrl": urls["diffuse"],
            "scale": scale_of(obj),
        })

    for obj, depth, container, via in walk(save.get("ObjectStates")):
        if via == "child":
            continue
        kind = obj.get("Name", "")
        if depth == 0:
            if kind in BAG_KINDS:
                continue
            record(obj, "(loose)")
            continue
        if kind in BAG_KINDS and obj.get("ContainedObjects"):
            continue
        record(obj, container or "(unnamed bag)")

    out = {}
    for group in sorted(groups):
        items = sorted(groups[group], key=lambda i: (i["nickname"], i["meshUrl"], i["scale"]))
        out[group] = items
    return out


def build_mod_index(mod_id, name, role, save):
    objects = save.get("ObjectStates") or []
    walked = 0
    ys = []
    for obj, depth, container, via in walk(objects):
        walked += 1
        if depth == 0:
            t = obj.get("Transform") or {}
            if "posY" in t:
                ys.append(float(t["posY"]))
    return {
        "modId": mod_id,
        "modName": name,
        "role": role,
        "saveName": save.get("SaveName") or "",
        "topLevelCount": len(objects),
        "walkedCount": walked,
        "posYMin": r3(min(ys)) if ys else None,
        "posYMax": r3(max(ys)) if ys else None,
        "countBelow1": sum(1 for y in ys if y < 1.0),
        "countBelowStashFloor": sum(1 for y in ys if y < STASH_FLOOR),
    }


def write_summary(path, catalog):
    s = catalog["summary"]
    lines = []
    lines.append("# TTS terrain asset catalog — summary")
    lines.append("")
    lines.append("Generated by `scripts/harvest_tts_assets.py` from the workshop saves listed in `modIndex`.")
    lines.append("")
    lines.append("- Unique terrain assets (primary URL + scale @ 2 dp): **%d**" % s["totalTerrainAssets"])
    lines.append("- Distinct base URLs across those assets: **%d**" % s["distinctBaseUrls"])
    lines.append("- With a measured rest height (upright in a reference mod): **%d**" % s["withRestHeight"])
    lines.append("- Of those flagged unstable (spread > %.1f): **%d**" % (UNSTABLE_SPREAD, s["unstable"]))
    lines.append("- TC:Map-only (no reference observation; needs in-TTS measurement, TC-008 deferred): **%d**" % s["tcMapOnly"])
    lines.append("- In a reference mod but never upright at top level (tilted or attached): **%d**" % s["inReferenceNoRestHeight"])
    lines.append("- Seen only in layout mods (no reference placement, not in TC:Map): **%d**" % s["layoutOnly"])
    lines.append("- Model-mod groups harvested: **%d**" % s["modelGroups"])
    lines.append("")
    lines.append("## Top tags")
    lines.append("")
    lines.append("| tag | assets |")
    lines.append("|---|---:|")
    for t in s["topTags"]:
        lines.append("| %s | %d |" % (t["tag"], t["count"]))
    lines.append("")
    lines.append("## Mods")
    lines.append("")
    lines.append("| mod | role | top-level | walked | posY min | posY max | below 1.0 |")
    lines.append("|---|---|---:|---:|---:|---:|---:|")
    for m in catalog["modIndex"]:
        lines.append("| %s %s | %s | %d | %d | %s | %s | %d |" % (
            m["modId"], m["modName"], m["role"], m["topLevelCount"], m["walkedCount"],
            m["posYMin"], m["posYMax"], m["countBelow1"]))
    lines.append("")
    lines.append("## 40 most-reused assets")
    lines.append("")
    lines.append("Ranked by number of source mods, then total placements.")
    lines.append("")
    lines.append("| id | nickname | kind | scale | restHeight | spread | mods | placements |")
    lines.append("|---|---|---|---|---:|---:|---:|---:|")
    for a in s["mostReused"]:
        lines.append("| %s | %s | %s | %s | %s | %s | %d | %d |" % (
            a["id"], a["nickname"].replace("|", "\\|"), a["kind"], "x".join(str(v) for v in a["scale"]),
            "" if a["restHeight"] is None else a["restHeight"],
            "" if a["restHeightSpread"] is None else a["restHeightSpread"],
            a["sourceModCount"], a["placements"]))
    lines.append("")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mods-dir", default="~/Library/Tabletop Simulator/Mods/Workshop")
    parser.add_argument("--out", default="data/tts/catalog.json")
    parser.add_argument("--summary", default="data/tts/catalog-summary.md")
    args = parser.parse_args(argv)

    mods_dir = os.path.expanduser(args.mods_dir)
    mod_names = {m[0]: m[1] for m in MODS}

    assets = {}
    models = {}
    mod_index = []
    missing = []

    for mod_id, name, role in MODS:
        path = os.path.join(mods_dir, mod_id + ".json")
        if not os.path.exists(path):
            missing.append(mod_id)
            print("missing: %s (%s)" % (path, name), file=sys.stderr)
            continue
        save = load_save(path)
        mod_index.append(build_mod_index(mod_id, name, role, save))
        if role == ROLE_MODELS:
            models[mod_id] = {
                "modName": name,
                "saveName": save.get("SaveName") or "",
                "groups": harvest_models(save),
            }
            continue
        for obj, depth, container, via in walk(save.get("ObjectStates")):
            kind = obj.get("Name", "")
            if kind not in TERRAIN_KINDS:
                continue
            url = primary_url(obj)
            if not url:
                continue
            scale = scale_of(obj)
            aid = asset_id(url, scale)
            acc = assets.get(aid)
            if acc is None:
                acc = AssetAccumulator(kind, all_urls(obj), scale)
                assets[aid] = acc
            acc.observe(obj, mod_id, role, depth, container, via)

    entries = [build_entry(aid, acc, mod_names) for aid, acc in sorted(assets.items())]

    tag_counts = Counter()
    for e in entries:
        tag_counts.update(e["tags"])
    reference_ids = {m[0] for m in MODS if m[2] == ROLE_REFERENCE}
    with_rest = [e for e in entries if e["restHeight"] is not None]
    tcmap_only = [e for e in entries if e["restHeight"] is None and e["tcMapPosY"]]
    in_reference_no_rest = [
        e for e in entries
        if e["restHeight"] is None and any(m["modId"] in reference_ids for m in e["sourceMods"])
    ]
    layout_only = [
        e for e in entries
        if e["restHeight"] is None and not e["tcMapPosY"]
        and not any(m["modId"] in reference_ids for m in e["sourceMods"])
    ]

    def reuse_key(e):
        return (-len(e["sourceMods"]), -sum(m["count"] for m in e["sourceMods"]), e["id"])

    most_reused = []
    for e in sorted(entries, key=reuse_key)[:40]:
        most_reused.append({
            "id": e["id"],
            "nickname": e["nicknames"][0]["nickname"] if e["nicknames"] else "",
            "kind": e["kind"],
            "scale": e["scale"],
            "restHeight": e["restHeight"],
            "restHeightSpread": e["restHeightSpread"],
            "sourceModCount": len(e["sourceMods"]),
            "placements": sum(m["count"] for m in e["sourceMods"]),
        })

    summary = {
        "totalTerrainAssets": len(entries),
        "distinctBaseUrls": len({e["urlKey"] for e in entries}),
        "withRestHeight": len(with_rest),
        "unstable": sum(1 for e in with_rest if e["unstable"]),
        "tcMapOnly": len(tcmap_only),
        "inReferenceNoRestHeight": len(in_reference_no_rest),
        "layoutOnly": len(layout_only),
        "modelGroups": sum(len(m["groups"]) for m in models.values()),
        "topTags": [
            {"tag": t, "count": c}
            for t, c in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:30]
        ],
        "mostReused": most_reused,
        "missingMods": sorted(missing),
    }

    catalog = {
        "schemaVersion": 1,
        "generator": "scripts/harvest_tts_assets.py",
        "conventions": {
            "identity": "sha1(primaryUrl|scaleX|scaleY|scaleZ @ 2dp)[:12]; urlKey groups scale variants of one URL",
            "heightStats": "only top-level objects (not bag contents, not ChildObjects) with posY >= %s" % STASH_FLOOR,
            "restHeight": "median posY across reference mods where |rotX|,|rotZ| within %s deg of 0 or 180" % UPRIGHT_TOLERANCE_DEG,
            "unstable": "restHeightSpread > %s; use restHeightMin as the rest estimate" % UNSTABLE_SPREAD,
            "referenceMods": [m[0] for m in MODS if m[2] == ROLE_REFERENCE],
            "tcMapMod": TCMAP_ID,
        },
        "summary": summary,
        "modIndex": mod_index,
        "assets": entries,
        "models": {k: models[k] for k in sorted(models)},
    }

    out_path = args.out
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(catalog, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write("\n")

    os.makedirs(os.path.dirname(args.summary) or ".", exist_ok=True)
    write_summary(args.summary, catalog)

    print("assets=%d withRestHeight=%d tcMapOnly=%d layoutOnly=%d modelGroups=%d -> %s" % (
        summary["totalTerrainAssets"], summary["withRestHeight"], summary["tcMapOnly"],
        summary["layoutOnly"], summary["modelGroups"], out_path))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
