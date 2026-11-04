#!/usr/bin/env python3
"""Map every Trench Crusade unit in data/rules/units.json to a 3D model in the locally cached
Tabletop Simulator model mods, and inventory the status markers, dice roller and counters.

Reads the raw workshop saves directly: the harvested catalog has no GUIDs, bag paths or child
objects, and both mods build each miniature as a base Custom_Model with the figure attached as
ChildObjects (Gannel's: Custom_Model children; Scripted Table: a Custom_Assetbundle child).
The top-level mesh is therefore the base; the figure lives in `parts`.

Standard library only. Deterministic: every collection is sorted before output.
"""

import argparse
import difflib
import json
import os
import re
import sys
import unicodedata

HOME = os.path.expanduser("~")
WORKSHOP = os.path.join(HOME, "Library", "Tabletop Simulator", "Mods", "Workshop")

SOURCES = [
    ("3700111403", "Gannel's Trench Crusade Model Corner"),
    ("3603166284", "Trench Crusade 1.0.2 - Scripted Table"),
]
# When two candidates score the same, the earlier mod in SOURCES wins.
MOD_PREFERENCE = {mod_id: i for i, (mod_id, _) in enumerate(SOURCES)}

FUZZY_THRESHOLD = 0.8

SCORE_EXACT = 1.0
SCORE_NORMALISED = 0.95
SCORE_ALIAS = 0.9
VARIANT_PENALTY = 0.05
REASON_RANK = {"exact": 0, "normalised": 1, "alias": 2, "fuzzy": 3}

# Bags whose contents are never unit models.
SKIP_BAG_RE = re.compile(r"(bases?$|^radius tools$)", re.IGNORECASE)
OBJECTIVE_BAG_RE = re.compile(r"objective", re.I)
SKIP_NICKNAMES = {"", "Text Tool", "Board"}

# Explicit aliases: unit name -> TTS nicknames seen in the saves (or expected shorthand).
ALIASES = {
    "Anointed Heavy Infantry": ["Annointed Heavy Infantry", "AHI"],
    "Chieftain": ["Jarl Chieftain"],
    "Chorister": ["Heretic Chorister"],
    "Heralds of Beelzebub": ["Herald of Beelzebub"],
    "Homunculus": ["Homonculus", "Takwin Homunculus"],
    "Hound of the Black Grail": ["Hounds of the Black Grail", "Grail Hound"],
    "Jabirean Alchemist": ["Jabirian Alchemist"],
    "Janissary": ["Jannisary"],
    "Lieutenant": ["Lieutennant", "Lt"],
    "Lord of Tumours": ["Lord of Tumors"],
    "Mechanized Heavy Infantry": ["MHI"],
    "Takwin Homunculus": ["Homonculus"],
    "Teğmen": ["Tegmen", "Tegmen Lieutenant"],
    "Trench Dog": ["Attack/Trench Dog", "Trench Dog/Hellhound"],
    "Trench Dogs of the Red Brigade": ["Attack/Trench Dog", "Trench Dog"],
    "Yoke Fiend": ["Yoke-Fiend"],
    "Yüzbaşı": ["Yüzbaşı Captain", "Yuzbasi Captain"],
    "\"Zamburak\" Weapon Platform": ["Zamburak"],
}

# Prefixes that mark a regional or styled variant of the same unit; stripped at a small penalty.
VARIANT_PREFIX_RE = re.compile(
    r"^(koa|prussian|papal|swiss|vatican|swiss guard|berserker|lazarist|naval raider)\s+", re.IGNORECASE
)
# Suffixes describing loadout or basing rather than identity.
VARIANT_SUFFIX_RE = re.compile(r"\s+(w/|with|on)\s+.*$", re.IGNORECASE)
PAREN_RE = re.compile(r"\s*\(([^)]*)\)\s*")

TOKEN_ROLES = [
    (re.compile(r"^activ", re.I), "activated"),
    (re.compile(r"^down", re.I), "down"),
    (re.compile(r"^tough", re.I), "tough"),
    (re.compile(r"^blood", re.I), "blood"),
    (re.compile(r"^blessing", re.I), "blessing"),
    (re.compile(r"dice roller", re.I), "dice"),
    (re.compile(r"^points$", re.I), "counter-points"),
    (re.compile(r"^turn$", re.I), "counter-turn"),
    (re.compile(r"^glory$", re.I), "counter-glory"),
]
BAG_KINDS = {"Bag", "Custom_Model_Bag", "Infinite_Bag", "Custom_Model_Infinite_Bag"}
TOKEN_KINDS = {"Custom_Token", "Custom_Tile", "Custom_Dice"}


def strip_accents(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def singular(word):
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def normalise(text):
    text = strip_accents(text).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(singular(w) for w in text.split())


def unit_name_forms(unit):
    """Normalised forms a unit can be recognised by, with (form, reason, penalty)."""
    name = unit["name"]
    forms = [(normalise(name), "normalised", 0.0)]
    if unit.get("bsName"):
        forms.append((normalise(unit["bsName"]), "normalised", 0.0))
    for alias in ALIASES.get(name, []):
        forms.append((normalise(alias), "alias", 0.0))
    seen = set()
    out = []
    for form, reason, penalty in forms:
        if form and form not in seen:
            seen.add(form)
            out.append((form, reason, penalty))
    return out


def nickname_forms(nickname):
    """Normalised forms of a TTS nickname, with the penalty for how far each is from the label."""
    forms = [(normalise(nickname), 0.0)]
    stripped = nickname
    for inner in PAREN_RE.findall(nickname):
        forms.append((normalise(inner), VARIANT_PENALTY))
    stripped = PAREN_RE.sub(" ", stripped).strip()
    if stripped != nickname:
        forms.append((normalise(stripped), VARIANT_PENALTY))
    no_suffix = VARIANT_SUFFIX_RE.sub("", stripped).strip()
    if no_suffix != stripped:
        forms.append((normalise(no_suffix), VARIANT_PENALTY))
    no_prefix = VARIANT_PREFIX_RE.sub("", no_suffix).strip()
    if no_prefix != no_suffix:
        forms.append((normalise(no_prefix), VARIANT_PENALTY))
    for part in no_suffix.split("/"):
        if "/" in no_suffix:
            forms.append((normalise(part), VARIANT_PENALTY))
    seen = {}
    for form, penalty in forms:
        if form and (form not in seen or penalty < seen[form]):
            seen[form] = penalty
    return sorted(seen.items())


def mesh_fields(obj):
    cm = obj.get("CustomMesh") or {}
    return {
        "meshUrl": cm.get("MeshURL") or None,
        "diffuseUrl": cm.get("DiffuseURL") or None,
        "normalUrl": cm.get("NormalURL") or None,
        "colliderUrl": cm.get("ColliderURL") or None,
    }


def transform(obj, keys):
    t = obj.get("Transform") or {}
    return [round(float(t.get(k, 0.0)), 4) for k in keys]


def part_record(child):
    rec = {
        "guid": child.get("GUID"),
        "kind": child.get("Name"),
        "nickname": child.get("Nickname", ""),
        "position": transform(child, ("posX", "posY", "posZ")),
        "rotation": transform(child, ("rotX", "rotY", "rotZ")),
        "scale": transform(child, ("scaleX", "scaleY", "scaleZ")),
    }
    if child.get("CustomMesh"):
        rec.update(mesh_fields(child))
    bundle = child.get("CustomAssetbundle")
    if bundle:
        rec["assetBundleUrl"] = bundle.get("AssetbundleURL") or None
    image = child.get("CustomImage")
    if image:
        rec["imageUrl"] = image.get("ImageURL") or None
    return rec


def walk(objects, bag_path, visit):
    for obj in objects:
        visit(obj, bag_path)
        contained = obj.get("ContainedObjects")
        if contained:
            walk(contained, bag_path + [obj.get("Nickname", "")], visit)


def load_save(mod_id, path):
    with open(path, encoding="utf-8") as fh:
        save = json.load(fh)
    models = []
    tokens = []

    def visit(obj, bag_path):
        kind = obj.get("Name")
        nickname = (obj.get("Nickname") or "").strip()
        in_objectives = any(OBJECTIVE_BAG_RE.search(b) for b in bag_path)
        if kind in ("Custom_Model", "Custom_Assetbundle") and in_objectives and not obj.get("ContainedObjects"):
            tokens.append({
                "modId": mod_id,
                "guid": obj.get("GUID"),
                "bagPath": list(bag_path),
                "nickname": nickname or (bag_path[-1] if bag_path else ""),
                "kind": kind,
                "imageUrl": None,
                "meshUrl": (obj.get("CustomMesh") or {}).get("MeshURL")
                or (obj.get("CustomAssetbundle") or {}).get("AssetbundleURL")
                or None,
                "role": "objective",
            })
            return
        if kind == "Custom_Model" and not obj.get("ContainedObjects"):
            if nickname in SKIP_NICKNAMES or any(SKIP_BAG_RE.search(b) for b in bag_path):
                return
            rec = {
                "modId": mod_id,
                "guid": obj.get("GUID"),
                "bagPath": list(bag_path),
                "nickname": nickname,
                "description": (obj.get("Description") or "").strip(),
                "scale": transform(obj, ("scaleX", "scaleY", "scaleZ")),
                "rotation": transform(obj, ("rotX", "rotY", "rotZ")),
                "parts": [part_record(c) for c in obj.get("ChildObjects") or []],
            }
            rec.update(mesh_fields(obj))
            models.append(rec)
        elif kind in TOKEN_KINDS or (kind in BAG_KINDS and obj.get("CustomMesh")):
            role = token_role(obj, bag_path)
            if role is None:
                return
            image = (obj.get("CustomImage") or {}).get("ImageURL") or None
            mesh = (obj.get("CustomMesh") or {}).get("MeshURL") or None
            tokens.append({
                "modId": mod_id,
                "guid": obj.get("GUID"),
                "bagPath": list(bag_path),
                "nickname": nickname,
                "kind": kind,
                "imageUrl": image,
                "meshUrl": mesh,
                "role": role,
            })

    walk(save.get("ObjectStates", []), [], visit)
    return save.get("SaveName", ""), models, tokens


def token_role(obj, bag_path):
    kind = obj.get("Name")
    nickname = (obj.get("Nickname") or "").strip()
    labels = [nickname] + [b for b in bag_path]
    for label in labels:
        for pattern, role in TOKEN_ROLES:
            if pattern.search(label):
                return role
    if kind in BAG_KINDS:
        return None
    if kind == "Custom_Dice" or (nickname and "marker" in nickname.lower()):
        return "other"
    return None


def score_candidates(unit, models, unit_forms, all_unit_forms):
    best_by_guid = {}
    for model in models:
        nick_forms = nickname_forms(model["nickname"])
        best = None
        for uform, ureason, upenalty in unit_forms:
            for nform, npenalty in nick_forms:
                penalty = upenalty + npenalty
                if nform == uform:
                    if ureason == "alias":
                        score, reason = SCORE_ALIAS, "alias"
                    elif model["nickname"].strip().lower() == unit["name"].strip().lower():
                        score, reason = SCORE_EXACT, "exact"
                    else:
                        score, reason = SCORE_NORMALISED, "normalised"
                else:
                    # Fuzzy only when the nickname form is not another unit's own name.
                    if nform in all_unit_forms and nform not in {f for f, _, _ in unit_forms}:
                        continue
                    ratio = difflib.SequenceMatcher(None, uform, nform).ratio()
                    if ratio < FUZZY_THRESHOLD:
                        continue
                    score, reason = round(ratio, 3), "fuzzy"
                score = round(score - penalty, 3)
                cand = (penalty > 0, REASON_RANK[reason], -score)
                if best is None or cand < best[0]:
                    best = (cand, score, reason, penalty > 0)
        if best is None:
            continue
        key = (model["modId"], model["guid"], model["nickname"])
        if key not in best_by_guid or best[0] < best_by_guid[key][0]:
            best_by_guid[key] = (best[0], best[1], best[2], best[3], model)
    out = []
    for _, score, reason, variant, model in best_by_guid.values():
        rec = {
            "modId": model["modId"],
            "guid": model["guid"],
            "bagPath": model["bagPath"],
            "nickname": model["nickname"],
            "description": model["description"] or None,
            "meshUrl": model["meshUrl"],
            "diffuseUrl": model["diffuseUrl"],
            "normalUrl": model["normalUrl"],
            "colliderUrl": model["colliderUrl"],
            "scale": model["scale"],
            "rotation": model["rotation"],
            "parts": model["parts"],
            "matchScore": score,
            "matchReason": reason,
            "variant": variant,
        }
        out.append(rec)
    return out


def candidate_sort_key(unit, cand):
    faction_bag = 0
    if cand["bagPath"] and normalise(cand["bagPath"][0]) == normalise(unit["factionName"]):
        faction_bag = -1
    return (
        cand["variant"],
        REASON_RANK[cand["matchReason"]],
        -cand["matchScore"],
        MOD_PREFERENCE.get(cand["modId"], 99),
        faction_bag,
        1 if cand["bagPath"] and cand["bagPath"][0] == "Misc Models" else 0,
        0 if cand["parts"] else 1,
        cand["bagPath"],
        cand["nickname"],
        cand["guid"],
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--workshop", default=WORKSHOP, help="Tabletop Simulator workshop cache directory")
    parser.add_argument("--units", default="data/rules/units.json")
    parser.add_argument("--factions", default="data/rules/factions.json")
    parser.add_argument("--out", default="data/tts/models.json")
    args = parser.parse_args(argv)

    with open(args.units, encoding="utf-8") as fh:
        units = json.load(fh)["units"]
    with open(args.factions, encoding="utf-8") as fh:
        factions = {f["id"]: f["name"] for f in json.load(fh)["factions"]}

    sources = []
    models = []
    tokens = []
    for mod_id, _ in SOURCES:
        path = os.path.join(args.workshop, mod_id + ".json")
        if not os.path.exists(path):
            print(f"missing workshop save: {path}", file=sys.stderr)
            return 1
        save_name, mod_models, mod_tokens = load_save(mod_id, path)
        sources.append({"modId": mod_id, "saveName": save_name})
        models.extend(mod_models)
        tokens.extend(mod_tokens)

    for unit in units:
        unit["factionName"] = factions.get(unit["factionId"], unit["factionId"])
    all_unit_forms = {f for u in units for f, _, _ in unit_name_forms(u)}

    results = {}
    used = set()
    merc_choice = {}
    for unit in sorted(units, key=lambda u: u["id"]):
        entry = {
            "unitName": unit["name"],
            "factionId": unit["factionId"],
            "kind": unit["kind"],
            "candidates": [],
            "chosen": None,
        }
        if unit["kind"] == "fireteam":
            entry["note"] = "fireteam wrapper with no model of its own; see members"
            entry["members"] = sorted(unit.get("members") or [])
            results[unit["id"]] = entry
            continue
        unit_forms = unit_name_forms(unit)
        cands = sorted(score_candidates(unit, models, unit_forms, all_unit_forms), key=lambda c: candidate_sort_key(unit, c))
        entry["candidates"] = cands
        merc_key = unit.get("mercenaryId") if unit.get("mercenary") else None
        if merc_key and merc_key in merc_choice:
            entry["chosen"] = merc_choice[merc_key]
            entry["chosenVia"] = "mercenary shared choice"
        elif cands:
            entry["chosen"] = cands[0]["guid"]
            if merc_key:
                merc_choice[merc_key] = cands[0]["guid"]
        if entry["chosen"]:
            for c in cands:
                if c["guid"] == entry["chosen"]:
                    entry["chosenModId"] = c["modId"]
                    entry["chosenNickname"] = c["nickname"]
                    used.add((c["modId"], c["guid"], c["nickname"]))
                    break
        results[unit["id"]] = entry

    unmatched = sorted(uid for uid, e in results.items() if e["kind"] != "fireteam" and e["chosen"] is None)
    unused = sorted(
        (
            {"modId": m["modId"], "guid": m["guid"], "bagPath": m["bagPath"], "nickname": m["nickname"]}
            for m in models
            if (m["modId"], m["guid"], m["nickname"]) not in used
        ),
        key=lambda m: (m["modId"], m["bagPath"], m["nickname"], m["guid"]),
    )

    coverage = {}
    for unit in units:
        if unit["kind"] == "fireteam":
            continue
        cov = coverage.setdefault(unit["factionId"], {"units": 0, "matched": 0, "pct": 0})
        cov["units"] += 1
        if results[unit["id"]]["chosen"]:
            cov["matched"] += 1
    for cov in coverage.values():
        cov["pct"] = round(100.0 * cov["matched"] / cov["units"], 1) if cov["units"] else 0
    total_units = sum(c["units"] for c in coverage.values())
    total_matched = sum(c["matched"] for c in coverage.values())
    coverage = dict(sorted(coverage.items()))
    coverage["_total"] = {
        "units": total_units,
        "matched": total_matched,
        "pct": round(100.0 * total_matched / total_units, 1) if total_units else 0,
    }

    tokens.sort(key=lambda t: (t["role"], t["modId"], t["bagPath"], t["nickname"], t["guid"]))

    guid_collisions = {}
    for mod_id, _ in SOURCES:
        seen = {}
        for m in models:
            if m["modId"] == mod_id:
                seen.setdefault(m["guid"], set()).add(m["nickname"])
        guid_collisions[mod_id] = sorted(g for g, names in seen.items() if len(names) > 1)

    output = {
        "$schema": "tc-tts-models-v1",
        "generator": "scripts/map_tts_models.py",
        "sources": sources,
        "notes": [
            "Each candidate's meshUrl is the top-level object (the base in both mods); the figure is in parts.",
            "GUIDs are not unique inside a save (TTS reassigns them on spawn); address a model by modId + guid + nickname. guidCollisions lists GUIDs shared by differently named models.",
            "Fireteam wrapper units have no model of their own and are excluded from coverage.",
        ],
        "aliases": {k: sorted(v) for k, v in sorted(ALIASES.items())},
        "guidCollisions": guid_collisions,
        "units": results,
        "tokens": tokens,
        "unmatchedUnits": unmatched,
        "unusedModels": unused,
        "coverage": coverage,
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
    print(
        f"{args.out}: {total_matched}/{total_units} units matched, {len(unmatched)} unmatched, "
        f"{len(models)} models scanned, {len(unused)} unused, {len(tokens)} tokens"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
