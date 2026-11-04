#!/usr/bin/env python3
"""Convert the NewRecruit/BattleScribe Trench Crusade dataset into data/rules/*.json.

Usage:
    python3 -I scripts/convert_newrecruit.py --src <path-to-fawkstrot-clone> --out data/rules [--overrides data/rules/pdf-overrides.json]

Reads `Trench Crusade.gst` plus every `*.cat` in --src and writes factions.json,
units.json and equipment.json (contract: packages/rules/src/schema.ts) and a
conversion report at CONVERSION-NOTES.md. Standard library only.
"""

import argparse
import collections
import glob
import json
import os
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET

REPO_URL = "https://github.com/Fawkstrot11/TrenchCrusade"

LIBRARY_NAMES = {"Battlekits", "Melee Weapons", "Ranged Weapons"}
MERCENARY_NAME = "Mercenaries"
CAMPAIGN_NAME = "Campaign Rules"
FACTION_TAGS = {"New Antioch", "Heretic", "Pilgrim", "Sultanate", "Black Grail", "The Court"}
SKIP_ENTRY_NAMES = {"Pile of Stuff", "Battlefield Title"}
SKIP_CATEGORIES = {"Configuration", "Pile"}
DUCATS_SYMBOL = "\U0001f451"  # crown
GLORY_SYMBOL = "☼"  # sun

DUCATS = "Ducats"
GLORY = "Glory Points"

# Three-valued logic helpers ---------------------------------------------------


def all3(values):
    values = list(values)
    if any(v is False for v in values):
        return False
    if any(v is None for v in values):
        return None
    return True


def any3(values):
    values = list(values)
    if any(v is True for v in values):
        return True
    if any(v is None for v in values):
        return None
    return False


# XML helpers --------------------------------------------------------------------


def tag(el):
    return el.tag.split("}", 1)[1] if "}" in el.tag else el.tag


def kids(el, name):
    """Direct children of the container child `name` (e.g. 'profiles' -> profile elements)."""
    out = []
    for c in el:
        if tag(c) == name:
            out.extend(list(c))
    return out


def text_of(el):
    return el.text or ""


def clean(text):
    if text is None:
        return ""
    text = text.replace("\xa0", " ").replace(DUCATS_SYMBOL, "").replace(GLORY_SYMBOL, "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def slug(name):
    s = unicodedata.normalize("NFKD", name)
    for a, b in (("ß", "ss"), ("ı", "i"), ("ø", "o"), ("æ", "ae"), ("œ", "oe"), ("ð", "d"), ("þ", "th"), ("ł", "l"), ("&", " and ")):
        s = s.replace(a, b)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def first_int(value):
    m = re.search(r"-?\d+", value or "")
    return int(m.group(0)) if m else None


def page_of(el):
    p = first_int(el.attrib.get("page", ""))
    return p if p and p > 0 else None


# Dataset model ------------------------------------------------------------------


class Dataset:
    def __init__(self, src):
        self.src = src
        self.catalogues = {}  # catalogue id -> info dict
        self.idx = {}  # element id -> element
        self.owner = {}  # element id -> catalogue id
        self.parent = {}  # id(element) -> parent element
        self.gst = None
        files = sorted(glob.glob(os.path.join(src, "*.gst"))) + sorted(glob.glob(os.path.join(src, "*.cat")))
        for f in files:
            root = ET.parse(f).getroot()
            info = {
                "file": os.path.basename(f),
                "id": root.attrib.get("id"),
                "name": root.attrib.get("name"),
                "revision": root.attrib.get("revision"),
                "library": root.attrib.get("library") == "true",
                "root": root,
                "kind": "gst" if tag(root) == "gameSystem" else "cat",
            }
            self.catalogues[info["id"]] = info
            if info["kind"] == "gst":
                self.gst = info
            for el in root.iter():
                for c in el:
                    self.parent[id(c)] = el
                eid = el.attrib.get("id")
                if eid and tag(el) not in ("categoryLink", "cost", "costType"):
                    self.idx.setdefault(eid, el)
                    self.owner.setdefault(eid, info["id"])
        self.by_name = {info["name"]: info for info in self.catalogues.values()}
        self.cost_ids = {}
        for ct in kids(self.gst["root"], "costTypes"):
            self.cost_ids[ct.attrib["id"]] = ct.attrib["name"]
        self.char_ids = {}
        for pt in kids(self.gst["root"], "profileTypes"):
            for ct in kids(pt, "characteristicTypes"):
                self.char_ids[ct.attrib["id"]] = (pt.attrib["name"], ct.attrib["name"])
        self.category_names = {}
        for cat_root in [c["root"] for c in self.catalogues.values()]:
            for ce in kids(cat_root, "categoryEntries"):
                self.category_names[ce.attrib["id"]] = ce.attrib["name"]
        self.shared_rules = {}
        for cat in self.catalogues.values():
            for r in kids(cat["root"], "sharedRules"):
                self.shared_rules[r.attrib["id"]] = r

    def get(self, eid):
        return self.idx.get(eid)

    def owner_name(self, el):
        eid = el.attrib.get("id")
        cid = self.owner.get(eid)
        if cid is None:
            p = self.parent.get(id(el))
            return self.owner_name(p) if p is not None else None
        return self.catalogues[cid]["name"]

    def in_campaign(self, el):
        return self.owner_name(el) == CAMPAIGN_NAME

    def in_library(self, el):
        return self.owner_name(el) in LIBRARY_NAMES

    def name_of_id(self, eid):
        el = self.get(eid)
        if el is None:
            return self.category_names.get(eid, eid)
        return el.attrib.get("name", eid)

    def is_foreign_root_entry(self, eid, faction_cat_id):
        """True when eid lives under a root-level selectionEntry of a *different* faction catalogue."""
        el = self.get(eid)
        if el is None:
            return False
        owner = self.owner.get(eid)
        if owner is None or owner == faction_cat_id:
            return False
        info = self.catalogues.get(owner)
        if info is None or info["kind"] != "cat" or info["library"]:
            return False
        node = el
        while True:
            p = self.parent.get(id(node))
            if p is None:
                return False
            if tag(p) == "catalogue":
                return tag(node) == "selectionEntries"
            node = p

    def resolve_target(self, eid):
        """Follow an entryLink to its target id; otherwise return eid."""
        el = self.get(eid)
        if el is not None and tag(el) == "entryLink":
            return el.attrib.get("targetId", eid)
        return eid


# Condition evaluation -----------------------------------------------------------

POSITIVE = {"atLeast", "instanceOf", "equalTo", "greaterThan"}
NEGATIVE = {"lessThan", "notInstanceOf", "notEqualTo", "atMost"}
LOCAL_SCOPES = {"self", "model", "parent", "ancestor", "unit"}
ROSTER_SCOPES = {"roster", "force"}
CATALOGUE_SCOPES = {"primary-catalogue", "catalogue", "primary-category"}


class Ctx:
    def __init__(self, ds, unit_el, link_el, faction_cat_id, variant_ids):
        self.ds = ds
        self.entry_ids = set()
        for el in (unit_el, link_el):
            if el is not None and el.attrib.get("id"):
                self.entry_ids.add(el.attrib["id"])
        self.cat_ids = set()
        for el in (unit_el, link_el):
            if el is not None:
                for cl in kids(el, "categoryLinks"):
                    self.cat_ids.add(cl.attrib.get("targetId"))
        self.faction_cat_id = faction_cat_id
        self.variant_ids = variant_ids


class Tally:
    def __init__(self):
        self.counts = collections.Counter()
        self.examples = {}
        self.seen = collections.defaultdict(set)

    def add(self, key, example=None, distinct=None):
        if distinct is not None:
            if distinct in self.seen[key]:
                return
            self.seen[key].add(distinct)
        self.counts[key] += 1
        if example and key not in self.examples:
            self.examples[key] = example


def eval_condition(c, ctx, deps, tally):
    ctype = c.attrib.get("type")
    scope = c.attrib.get("scope")
    child = c.attrib.get("childId")
    value = first_int(c.attrib.get("value", "1"))
    if ctype == "never":
        return False
    if child == "any" or child is None:
        tally.add(("condition", ctype, scope, "childId=any"))
        return None
    if scope in CATALOGUE_SCOPES:
        is_fac = child == ctx.faction_cat_id
        if ctype in POSITIVE:
            return is_fac
        if ctype in NEGATIVE:
            return not is_fac
        tally.add(("condition", ctype, scope))
        return None
    if scope in LOCAL_SCOPES:
        if child in ctx.entry_ids:
            if ctype in POSITIVE:
                return value is None or value <= 1
            if ctype in NEGATIVE:
                return not (value is None or value <= 1)
        if child in ctx.ds.category_names:
            has = child in ctx.cat_ids
            if ctype in ("instanceOf",):
                return has
            if ctype in ("notInstanceOf",):
                return not has
            if ctype == "atLeast" and has and (value or 1) <= 1:
                return True
            if ctype == "lessThan" and has and (value or 1) <= 1:
                return False
            tally.add(("condition", ctype, scope, "category"))
            return None
        # a model/unit entry other than this unit can never be the scoped selection
        # (e.g. "instanceOf Lieutenant" evaluated for a Sniper Priest)
        target = ctx.ds.get(ctx.ds.resolve_target(child))
        if ctx.entry_ids and target is not None and tag(target) == "selectionEntry" and target.attrib.get("type") in ("model", "unit"):
            if ctype in POSITIVE:
                return False
            if ctype in NEGATIVE:
                return True
        deps.append(("selection", ctype, child))
        return None
    if scope in ROSTER_SCOPES:
        if child in ctx.variant_ids:
            deps.append(("variant", ctype, child))
            return None
        if ctx.ds.is_foreign_root_entry(child, ctx.faction_cat_id):
            # a root entry of another faction can never be on this faction's roster
            return False if ctype in POSITIVE else (True if ctype in NEGATIVE else None)
        deps.append(("roster", ctype, child))
        return None
    tally.add(("condition", ctype, scope))
    deps.append(("other", ctype, child))
    return None


def _eval_children(el, ctx, tally):
    """Evaluate each condition/group child with its own deps list -> [(value, deps)]."""
    out = []
    for c in kids(el, "conditions"):
        d = []
        out.append((eval_condition(c, ctx, d, tally), d))
    for sg in kids(el, "conditionGroups"):
        d = []
        out.append((eval_group(sg, ctx, d, tally), d))
    return out


def _combine(results, gtype, deps):
    """Three-valued and/or over child results. Dependencies are only reported when
    the combined result is unknown, and then only from the children that were unknown;
    a child that resolved (or a group short-circuited by a known value) contributes none."""
    vals = [v for v, _ in results]
    res = any3(vals) if gtype == "or" else all3(vals)
    if res is None:
        for v, d in results:
            if v is None:
                deps.extend(d)
    return res


def eval_group(g, ctx, deps, tally):
    gtype = g.attrib.get("type", "and")
    results = _eval_children(g, ctx, tally)
    if not results:
        return True
    return _combine(results, gtype, deps)


def eval_modifier_conditions(m, ctx, deps, tally, extra=()):
    results = _eval_children(m, ctx, tally)
    results += [(v, []) for v in extra]
    if not results:
        return True
    return _combine(results, "and", deps)


def iter_modifiers(el, ctx, tally):
    """Yield (modifier, group_result, group_deps) for modifiers directly on el and inside its modifierGroups."""
    for m in kids(el, "modifiers"):
        yield m, True, []
    for g in kids(el, "modifierGroups"):
        gdeps = []
        gres = eval_modifier_conditions(g, ctx, gdeps, tally)
        for m in kids(g, "modifiers"):
            yield m, gres, gdeps


def visibility(elements, ctx, tally):
    """Return (state, deps) where state is 'visible' | 'hidden' | 'conditional'.

    `elements` are evaluated in order (target first, then its link) so that link
    attributes and modifiers take precedence, mirroring BattleScribe.
    """
    present = [el for el in elements if el is not None]
    if len(present) == 2 and tag(present[1]) == "entryLink":
        target, link = present
        # The link's own flag governs; a hidden target only leaks through when it
        # carries its own hide/unhide modifiers (it then encodes availability itself).
        target_has_hidden_mods = any(
            m.attrib.get("field") == "hidden" for m in target.iter() if tag(m) == "modifier"
        )
        hidden = link.attrib.get("hidden") == "true" or (target_has_hidden_mods and target.attrib.get("hidden") == "true")
    else:
        hidden = any(el.attrib.get("hidden") == "true" for el in present)
    state = "hidden" if hidden else "visible"
    deps = []
    for el in elements:
        if el is None:
            continue
        for m, gres, gdeps in iter_modifiers(el, ctx, tally):
            if m.attrib.get("field") != "hidden" or m.attrib.get("type") != "set":
                continue
            want_hidden = m.attrib.get("value") == "true"
            local_deps = list(gdeps)
            res = eval_modifier_conditions(m, ctx, local_deps, tally, extra=[gres])
            if res is True:
                state = "hidden" if want_hidden else "visible"
                deps = []
            elif res is None:
                if want_hidden and state != "hidden":
                    state = "conditional"
                    deps.extend([(d, "hides") for d in local_deps])
                elif not want_hidden and state != "visible":
                    state = "conditional"
                    deps.extend([(d, "unhides") for d in local_deps])
            # res False: modifier never applies for this context
    return state, deps


# Parsing helpers ------------------------------------------------------------------


def costs_of(el):
    out = {}
    if el is None:
        return out
    for c in kids(el, "costs"):
        v = c.attrib.get("value")
        try:
            out[c.attrib.get("name")] = float(v)
        except (TypeError, ValueError):
            pass
    return out


def profiles_of(ds, el):
    """Own profiles plus profiles reached by infoLinks of type profile."""
    out = []
    for p in kids(el, "profiles"):
        out.append((p, None))
    for il in kids(el, "infoLinks"):
        if il.attrib.get("type") == "profile":
            target = ds.get(il.attrib.get("targetId"))
            if target is not None:
                out.append((target, il))
    return out


def chars_of(profile):
    out = {}
    for c in kids(profile, "characteristics"):
        out[c.attrib.get("name")] = clean(text_of(c))
    return out


def number_or_none(v):
    return v if v is None else (int(v) if float(v).is_integer() else v)


def cost_obj(costs):
    d = costs.get(DUCATS)
    g = costs.get(GLORY)
    if d is None and g is not None:
        d = 0
    if g is None and d is not None:
        g = 0
    return {
        "ducats": number_or_none(d) if d is not None and d >= 0 else (None if d is None else 0),
        "glory": number_or_none(g) if g is not None and g >= 0 else (None if g is None else 0),
    }


def parse_movement(raw):
    raw_c = clean(raw)
    m = re.match(r'^\s*(\d+(?:\.\d+)?)\s*["”″’\']?\s*/?\s*(.*?)\s*$', raw_c)
    if not m or raw_c in ("", "-"):
        return {"inches": None, "type": None, "raw": raw_c}
    inches = float(m.group(1))
    inches = int(inches) if inches.is_integer() else inches
    mtype = m.group(2).strip() or None
    return {"inches": inches, "type": mtype, "raw": raw_c}


def parse_dice(raw):
    raw_c = clean(raw)
    m = re.match(r"^\s*([+-]?)\s*(\d+)\s*(dice|d)?\s*$", raw_c, re.I)
    if m:
        sign = m.group(1) or "+"
        return f"{sign}{int(m.group(2))}"
    if raw_c.lower() in ("", "-", "n/a", "na", "none"):
        return "n/a"
    return raw_c


def scope_label(scope, root_level):
    if scope in ("roster", "force"):
        return "warband"
    if scope == "parent":
        return "warband" if root_level else "model"
    if scope == "model":
        return "model"
    if scope == "self":
        return "self"
    return scope


def describe_constraints(ds, elements, root_level, tally):
    parts = []
    mins, maxs = [], []
    for el in elements:
        if el is None:
            continue
        for c in kids(el, "constraints"):
            if c.attrib.get("field") != "selections":
                tally.add(("constraint-field", c.attrib.get("field")))
                continue
            ctype = c.attrib.get("type")
            value = first_int(c.attrib.get("value"))
            scope = c.attrib.get("scope")
            label = scope_label(scope, root_level)
            parts.append(f"{ctype} {value} per {label}")
            if label == "warband" or (root_level and label == "self"):
                (mins if ctype == "min" else maxs).append(value)
            # modifiers that change this constraint
            cid = c.attrib.get("id")
            for other in elements:
                if other is None:
                    continue
                for m in kids(other, "modifiers"):
                    if m.attrib.get("field") == cid:
                        why = describe_conditions(ds, m)
                        parts.append(f"{ctype} {m.attrib.get('type')} {m.attrib.get('value')} per {label}{why}")
                        tally.add(("modifier", m.attrib.get("type"), "constraint (distinct constraints)"), distinct=cid)
    return parts, (min(mins) if mins else None), (max(maxs) if maxs else None)


def describe_conditions(ds, m):
    refs = []
    for c in m.iter():
        if tag(c) == "condition":
            name = ds.name_of_id(c.attrib.get("childId"))
            refs.append(f"{c.attrib.get('type')} {c.attrib.get('value')} {name} ({c.attrib.get('scope')})")
    for r in kids(m, "repeats"):
        refs.append(f"repeat per {ds.name_of_id(r.attrib.get('childId'))} ({r.attrib.get('scope')})")
    return (" when " + "; ".join(refs)) if refs else ""


# Converter ------------------------------------------------------------------------


class Converter:
    def __init__(self, ds):
        self.ds = ds
        self.tally = Tally()
        self.notes = collections.defaultdict(list)
        self.hidden_units = collections.defaultdict(list)
        self.factions = []
        self.units = []
        self.item_defs = {}  # key -> item def
        self.item_link_costs = collections.defaultdict(list)  # key -> [(ducats, glory)]
        self.item_faction_ids = collections.defaultdict(set)
        self.armour_votes = collections.defaultdict(collections.Counter)  # key -> Counter(delta)
        self.stat_votes = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
        self.unit_armour_votes = []  # (unit_id, key, delta)
        self.merged_key = {}  # original item key -> final item id
        self.stat_fields = {}
        for cid, (ptype, cname) in ds.char_ids.items():
            if ptype == "Unit":
                self.stat_fields[cid] = cname.lower()

    # -- items -------------------------------------------------------------------

    def is_item_profile(self, profile):
        ptype = profile.attrib.get("typeName")
        if ptype == "Weapon":
            return True
        if ptype == "Battlekit":
            return bool(chars_of(profile).get("Type"))
        return False

    def item_refs_for_entry(self, el):
        """Return list of (key, profile_el, source) for item profiles carried by an entry."""
        refs = []
        for p, via in profiles_of(self.ds, el):
            if not self.is_item_profile(p):
                continue
            if via is None:
                refs.append((el.attrib.get("id"), p, "entry"))
            else:
                refs.append((p.attrib.get("id"), p, "profile"))
        return refs

    def register_item(self, key, profile, entry, source):
        if key in self.item_defs:
            return
        owner = self.ds.owner_name(profile if source == "profile" else entry)
        self.item_defs[key] = {
            "key": key,
            "name": clean(entry.attrib.get("name", "")) if source == "entry" else clean(profile.attrib.get("name", "")),
            "profileName": clean(profile.attrib.get("name", "")),
            "profileType": profile.attrib.get("typeName"),
            "chars": chars_of(profile),
            "owner": owner,
            "library": owner in LIBRARY_NAMES,
            "entry": entry if source == "entry" else None,
            "profile": profile,
            "page": page_of(profile) or (page_of(entry) if entry is not None else None),
            "hidden": entry.attrib.get("hidden") == "true" if source == "entry" else False,
            "groups": set(),
            "stat_mods": {},
        }
        if source == "entry":
            # unconditional stat modifiers that affect the unit profile (e.g. Anfarro: melee +1)
            for m in kids(entry, "modifiers"):
                field = m.attrib.get("field")
                if field in self.stat_fields and m.attrib.get("affects", "").startswith("profiles") and not list(m):
                    delta = first_int(m.attrib.get("value"))
                    if m.attrib.get("type") == "decrement":
                        delta = -delta
                    if m.attrib.get("type") in ("increment", "decrement") and delta is not None:
                        self.item_defs[key]["stat_mods"][self.stat_fields[field]] = delta

    def register_library_items(self):
        for cat in self.ds.catalogues.values():
            if cat["name"] not in LIBRARY_NAMES:
                continue
            for container in ("sharedSelectionEntries", "selectionEntries"):
                for se in kids(cat["root"], container):
                    refs = self.item_refs_for_entry(se)
                    for key, p, source in refs:
                        self.register_item(key, p, se, source)
                    if not refs:
                        self.tally.add(("library-entry-without-item-profile",), se.attrib.get("name"))

    # -- factions ----------------------------------------------------------------

    def faction_catalogues(self):
        return sorted(
            [c for c in self.ds.catalogues.values() if c["kind"] == "cat" and not c["library"]],
            key=lambda c: c["name"],
        )

    def variant_entries(self, cat):
        """Return (variants, config_entries). Variants are selectionEntries under a 'Warband Variant' root entry."""
        variants, configs = [], []
        for se in kids(cat["root"], "selectionEntries"):
            name = se.attrib.get("name", "").strip()
            cats = {cl.attrib.get("name") for cl in kids(se, "categoryLinks")}
            if name == "Warband Variant":
                for g in kids(se, "selectionEntryGroups"):
                    for v in kids(g, "selectionEntries"):
                        variants.append((v, g))
            elif "Configuration" in cats:
                configs.append(se)
        return variants, configs

    def named_texts(self, el, ctx=None):
        """Ability/Battlekit(no Type) profiles, inline rules and rule infoLinks as [{name,text}]."""
        out, seen = [], set()
        for p, via in profiles_of(self.ds, el):
            ptype = p.attrib.get("typeName")
            ch = chars_of(p)
            if ptype == "Ability":
                text = ch.get("Description", "")
            elif ptype == "Battlekit" and not ch.get("Type"):
                text = ch.get("Rules", "")
            else:
                continue
            name = clean(p.attrib.get("name", ""))
            if (name, text) in seen:
                continue
            seen.add((name, text))
            item = {"name": name, "text": text}
            if ctx is not None:
                state, deps = visibility([p, via], ctx, self.tally)
                if state == "hidden":
                    continue
                if state == "conditional":
                    item.update(self.deps_fields(deps))
            out.append(item)
        for r in kids(el, "rules"):
            name = clean(r.attrib.get("name", ""))
            desc = ""
            for d in r:
                if tag(d) == "description":
                    desc = clean(text_of(d))
            if (name, desc) not in seen:
                seen.add((name, desc))
                out.append({"name": name, "text": desc})
        for il in kids(el, "infoLinks"):
            if il.attrib.get("type") != "rule":
                continue
            rule = self.ds.shared_rules.get(il.attrib.get("targetId"))
            if rule is None:
                continue
            name = clean(rule.attrib.get("name", ""))
            desc = ""
            for d in rule:
                if tag(d) == "description":
                    desc = clean(text_of(d))
            if (name, desc) in seen:
                continue
            seen.add((name, desc))
            item = {"name": name, "text": desc, "sharedRule": True}
            if ctx is not None:
                state, deps = visibility([il], ctx, self.tally)
                if state == "hidden":
                    continue
                if state == "conditional":
                    item.update(self.deps_fields(deps))
            out.append(item)
        return out

    def deps_fields(self, deps):
        """Translate visibility dependencies into onlyWith / onlyWithout / conditionNote."""
        only_with, only_without, other = set(), set(), set()
        for (kind, ctype, child), effect in deps:
            positive = ctype in POSITIVE
            requires = positive if effect == "unhides" else not positive
            label = self.ref_label(kind, child)
            if kind in ("variant", "roster"):
                (only_with if requires else only_without).add(label)
            else:
                verb = "only if" if effect == "unhides" else "hidden if"
                other.add(f"{verb} {ctype} {self.ds.name_of_id(child)}")
        out = {}
        if only_with:
            out["onlyWith"] = sorted(only_with)
        if only_without:
            out["onlyWithout"] = sorted(only_without)
        if other:
            out["conditionNote"] = "; ".join(sorted(other))
        return out

    def ref_label(self, kind, child):
        if kind == "variant" and child in self.variant_id_map:
            return self.variant_id_map[child]
        el = self.ds.get(child)
        if kind == "roster" and el is not None:
            return f"{self.ds.name_of_id(child)} [{self.ds.owner_name(el)}]"
        return self.ds.name_of_id(child)

    def convert(self):
        self.register_library_items()
        for cat in self.faction_catalogues():
            self.convert_faction(cat)
        self.finalise_items()
        self.finalise_units()

    def convert_faction(self, cat):
        fid = slug(cat["name"])
        variants, configs = self.variant_entries(cat)
        self.variant_id_map = {}
        variant_ids = set()
        for v, g in variants:
            vid = f"{fid}/{slug(v.attrib.get('name', ''))}"
            self.variant_id_map[v.attrib["id"]] = vid
            variant_ids.add(v.attrib["id"])
        # configuration choices gate things too; name them so deps read well
        for cfg in configs:
            for se in cfg.iter():
                if tag(se) == "selectionEntry" and se is not cfg:
                    variant_ids.add(se.attrib["id"])
        self.current_variant_ids = variant_ids
        faction = {
            "id": fid,
            "name": clean(cat["name"]),
            "bsId": cat["id"],
            "keywords": [],
            "rules": [],
            "variants": [],
            "unitIds": [],
            "campaignLinks": [],
        }
        for v, g in variants:
            var = {
                "id": self.variant_id_map[v.attrib["id"]],
                "bsId": v.attrib["id"],
                "name": clean(v.attrib.get("name", "")),
                "rules": self.named_texts(v),
            }
            var["text"] = "\n".join(f"{r['name']}: {r['text']}" if r["text"] else r["name"] for r in var["rules"])
            c = costs_of(v)
            if any(c.values()):
                var["cost"] = cost_obj(c)
            nested = [x for x in kids(v, "selectionEntryGroups")]
            if nested:
                var["optionGroups"] = sorted(clean(x.attrib.get("name", "")) for x in nested)
                self.tally.add(("variant-option-group",), f"{cat['name']}: {v.attrib.get('name')}")
            faction["variants"].append(var)
        faction["variants"].sort(key=lambda x: x["id"])
        for cfg in configs:
            faction["rules"].extend(self.named_texts(cfg))
            choices = []
            for g in kids(cfg, "selectionEntryGroups"):
                for se in kids(g, "selectionEntries"):
                    choice = {"name": clean(se.attrib.get("name", "")), "bsId": se.attrib["id"], "rules": self.named_texts(se)}
                    choices.append(choice)
                for sg in kids(g, "selectionEntryGroups"):
                    for se in kids(sg, "selectionEntries"):
                        choice = {"name": clean(se.attrib.get("name", "")), "bsId": se.attrib["id"], "rules": self.named_texts(se), "group": clean(sg.attrib.get("name", ""))}
                        choices.append(choice)
            faction.setdefault("configuration", []).append(
                {"name": clean(cfg.attrib.get("name", "")), "bsId": cfg.attrib["id"], "choices": choices}
            )
        for il in kids(cat["root"], "infoLinks"):
            pass
        faction["rules"].extend(self.named_texts(cat["root"]))
        for fe in kids(cat["root"], "forceEntries"):
            for m in fe.iter():
                if tag(m) == "modifier" and m.attrib.get("field") == "error":
                    faction.setdefault("rosterErrors", []).append(clean(m.attrib.get("value", "")) + describe_conditions(self.ds, m))
        # units
        candidates = []

        def is_unit_entry(se):
            # the Combat Biologist is typed "upgrade" upstream but carries a Unit profile
            return se.attrib.get("type") in ("model", "unit") or any(
                p.attrib.get("typeName") == "Unit" for p, _ in profiles_of(self.ds, se)
            )

        def add_root(root_el):
            for se in kids(root_el, "selectionEntries"):
                if is_unit_entry(se):
                    candidates.append((se, None))
                    if se.attrib.get("type") == "unit":
                        # a deprecated fireteam wrapper can hold the only link a faction has to a
                        # mercenary model (Mamluk Faris); the model is still recruitable on its own
                        for ln in kids(se, "entryLinks"):
                            target = self.ds.get(ln.attrib.get("targetId"))
                            if target is not None and target.attrib.get("type") == "model" and self.ds.owner_name(target) == MERCENARY_NAME:
                                candidates.append((target, None))
            for el in kids(root_el, "entryLinks"):
                if el.attrib.get("type") == "selectionEntry":
                    target = self.ds.get(el.attrib.get("targetId"))
                    if target is not None and is_unit_entry(target):
                        candidates.append((target, el))

        add_root(cat["root"])
        merc = self.ds.by_name.get(MERCENARY_NAME)
        if merc:
            add_root(merc["root"])
        # several candidates can point at one target (e.g. a hidden variant-only link and the
        # plain mercenary entry); the plainly visible one describes the unit, a conditional one is
        # only used when nothing visible exists
        by_target = {}
        order = []
        for entry, link in candidates:
            name = clean(entry.attrib.get("name", ""))
            if name in SKIP_ENTRY_NAMES:
                continue
            cats = {cl.attrib.get("name") for cl in kids(entry, "categoryLinks")}
            if cats & SKIP_CATEGORIES:
                continue
            tid = entry.attrib["id"]
            ctx = Ctx(self.ds, entry, link, cat["id"], variant_ids)
            state, deps = visibility([entry, link], ctx, self.tally)
            rank = {"visible": 0, "conditional": 1, "hidden": 2}[state]
            if tid not in by_target:
                order.append(tid)
                by_target[tid] = (rank, entry, link, ctx, state, deps)
            elif rank < by_target[tid][0]:
                by_target[tid] = (rank, entry, link, ctx, state, deps)
        tags_seen = collections.Counter()
        campaign_links = set()
        for tid in order:
            rank, entry, link, ctx, state, deps = by_target[tid]
            name = clean(entry.attrib.get("name", ""))
            if state == "hidden":
                self.hidden_units[f"{name} ({tid}, {self.ds.owner_name(entry)})"].append(cat["name"])
                continue
            unit = self.convert_unit(cat, fid, entry, link, ctx, state, deps, campaign_links)
            if unit is None:
                continue
            if not unit.get("mercenary"):
                for k in unit["keywords"]:
                    if k in FACTION_TAGS:
                        tags_seen[k] += 1
            self.units.append(unit)
            faction["unitIds"].append(unit["id"])
        faction["unitIds"] = sorted(set(faction["unitIds"]))
        faction["keywords"] = sorted(tags_seen)
        if not faction["keywords"]:
            faction["keywords"] = sorted(t for t in FACTION_TAGS if t.lower() in cat["name"].lower())
        faction["campaignLinks"] = sorted(campaign_links)
        self.factions.append(faction)

    # -- units -------------------------------------------------------------------

    def convert_unit(self, cat, fid, entry, link, ctx, state, deps, campaign_links):
        name = clean(entry.attrib.get("name", ""))
        if link is not None and link.attrib.get("name"):
            name = clean(link.attrib.get("name"))
        owner = self.ds.owner_name(entry)
        is_merc = owner in (MERCENARY_NAME, self.ds.gst["name"]) or "Mercenary" in {
            cl.attrib.get("name") for cl in kids(entry, "categoryLinks")
        }
        kind = "fireteam" if entry.attrib.get("type") == "unit" else "model"
        unit_id = f"{fid}/{slug(name)}"
        if kind == "fireteam" and not unit_id.endswith("fireteam"):
            unit_id += "-fireteam"
        notes = []
        keywords = set()
        for el in (entry, link):
            if el is None:
                continue
            for cl in kids(el, "categoryLinks"):
                keywords.add(clean(cl.attrib.get("name") or self.ds.category_names.get(cl.attrib.get("targetId"), "")))
            for m in kids(el, "modifiers"):
                if m.attrib.get("field") == "category" and m.attrib.get("type") == "add":
                    cname = self.ds.category_names.get(m.attrib.get("value"), m.attrib.get("value"))
                    if list(m):
                        notes.append(f"gains keyword {cname}{describe_conditions(self.ds, m)}")
                        self.tally.add(("modifier", "add", "category", "conditional"))
                    else:
                        keywords.add(cname)
                elif m.attrib.get("field") == "category" and m.attrib.get("type") == "remove":
                    self.tally.add(("modifier", "remove", "category"))
                elif m.attrib.get("field") == "name":
                    self.tally.add(("modifier", m.attrib.get("type"), "name"))
                    notes.append(f"renamed to '{m.attrib.get('value')}'{describe_conditions(self.ds, m)}")
                elif m.attrib.get("field") == "error":
                    self.tally.add(("modifier", "add", "error"))
                    notes.append(f"roster error: {clean(m.attrib.get('value', ''))}{describe_conditions(self.ds, m)}")
        keywords.discard("")
        # stats
        unit_profile = None
        for p, via in profiles_of(self.ds, entry):
            if p.attrib.get("typeName") == "Unit":
                unit_profile = p
                break
        if unit_profile is None and kind == "model":
            # some models keep their profile on a mandatory sub-option (e.g. Grail Thrall -> Thrall Type)
            for sub in entry.iter():
                if sub is entry or tag(sub) != "selectionEntry":
                    continue
                for p, via in profiles_of(self.ds, sub):
                    if p.attrib.get("typeName") == "Unit":
                        unit_profile = p
                        notes.append(f"stats taken from sub-option '{clean(sub.attrib.get('name', ''))}' (profile '{clean(p.attrib.get('name', ''))}')")
                        self.tally.add(("unit-profile-on-sub-option",), f"{cat['name']}: {name}")
                        break
                if unit_profile is not None:
                    break
        if unit_profile is None:
            stats = {"movement": {"inches": None, "type": None, "raw": ""}, "ranged": "", "melee": "", "armour": 0, "base": ""}
            notes.append("no Unit profile in source (fireteam/wrapper entry); stats are placeholders")
            self.tally.add(("unit-without-profile",), f"{cat['name']}: {name}")
        else:
            ch = chars_of(unit_profile)
            armour = first_int(ch.get("Armour", ""))
            if armour is None:
                notes.append(f"armour not numeric in source: {ch.get('Armour')!r}")
                armour = 0
            stats = {
                "movement": parse_movement(ch.get("Movement", "")),
                "ranged": parse_dice(ch.get("Ranged", "")),
                "melee": parse_dice(ch.get("Melee", "")),
                "armour": armour,
                "base": ch.get("Base", ""),
            }
        # cost
        costs = costs_of(entry)
        costs.update(costs_of(link))
        for el in (entry, link):
            if el is None:
                continue
            for m in kids(el, "modifiers"):
                field = m.attrib.get("field")
                if field in self.ds.cost_ids:
                    cname = self.ds.cost_ids[field]
                    val = float(m.attrib.get("value", "0") or 0)
                    if list(m):
                        notes.append(f"{cname} {m.attrib.get('type')} {m.attrib.get('value')}{describe_conditions(self.ds, m)}")
                        self.tally.add(("modifier", m.attrib.get("type"), "cost", "conditional"))
                    else:
                        t = m.attrib.get("type")
                        if t == "set":
                            costs[cname] = val
                        elif t == "increment":
                            costs[cname] = costs.get(cname, 0) + val
                        elif t == "decrement":
                            costs[cname] = costs.get(cname, 0) - val
        cost = cost_obj({DUCATS: costs.get(DUCATS, 0.0), GLORY: costs.get(GLORY, 0.0)})
        # limits
        parts, cmin, cmax = describe_constraints(self.ds, [entry, link], True, self.tally)
        limits = {"min": cmin if cmin is not None and cmin >= 0 else None, "max": cmax if cmax and cmax > 0 else None}
        if cmax is not None and cmax <= 0:
            notes.append(f"source max is {cmax} (entry only unlocked by a modifier)")
        if parts:
            limits["text"] = "; ".join(parts)
        # abilities
        abilities = self.named_texts(entry, ctx)
        if link is not None:
            abilities.extend(self.named_texts(link, ctx))
        built_in = []
        built_in_kit = []
        for p, via in profiles_of(self.ds, entry):
            ch = chars_of(p)
            if p.attrib.get("typeName") == "Weapon":
                built_in.append({"name": clean(p.attrib.get("name", "")), "type": ch.get("Type", ""), "range": ch.get("Range", ""), "keywords": split_keywords(ch.get("Keywords", "")), "rules": ch.get("Rules", "")})
            elif p.attrib.get("typeName") == "Battlekit" and ch.get("Type"):
                built_in_kit.append({"name": clean(p.attrib.get("name", "")), "type": ch.get("Type", ""), "keywords": split_keywords(ch.get("Keywords", "")), "rules": ch.get("Rules", "")})
        # equipment access + upgrades (fireteam wrappers carry none of their own)
        if kind == "fireteam":
            access, upgrades = [], []
        else:
            access, upgrades = self.walk_access(entry, link, ctx, campaign_links, notes)
        unit = {
            "id": unit_id,
            "bsId": entry.attrib["id"],
            "factionId": fid,
            "name": name,
            "kind": kind,
            "elite": "Elite" in keywords,
            "keywords": sorted(keywords),
            "stats": stats,
            "cost": cost,
            "limits": limits,
            "abilities": abilities,
            "equipmentAccess": access,
        }
        if entry.attrib.get("name", "") != name and clean(entry.attrib.get("name", "")) != name:
            unit["bsName"] = entry.attrib.get("name", "")
        elif entry.attrib.get("name", "") != entry.attrib.get("name", "").strip():
            unit["bsName"] = entry.attrib.get("name", "")
        if link is not None:
            unit["bsLinkId"] = link.attrib.get("id")
        if is_merc:
            unit["mercenary"] = True
            unit["mercenaryId"] = f"mercenary/{slug(name)}"
        if page_of(entry):
            unit["page"] = page_of(entry)
        if built_in:
            unit["builtInWeapons"] = built_in
        if built_in_kit:
            unit["builtInEquipment"] = built_in_kit
        if upgrades:
            unit["upgrades"] = upgrades
        if kind == "fireteam":
            members = []
            for el in entry.iter():
                if tag(el) == "entryLink" and el.attrib.get("type") == "selectionEntry":
                    t = self.ds.get(el.attrib.get("targetId"))
                    if t is not None and t.attrib.get("type") == "model":
                        members.append(f"{fid}/{slug(clean(t.attrib.get('name', '')))}")
            unit["members"] = sorted(set(members))
        if state == "conditional":
            fields = self.deps_fields(deps)
            unit.update(fields)
            vids = [v for v in fields.get("onlyWith", []) if v in self.variant_id_map.values()]
            if vids:
                unit["variantIds"] = sorted(vids)
        # armour votes from unit profile modifiers
        if unit_profile is not None:
            self.current_upgrades = upgrades
            self.collect_stat_votes(unit_id, unit_profile, stats["armour"], access, notes)
        if notes:
            unit["notes"] = "; ".join(notes)
        return unit

    def collect_stat_votes(self, unit_id, profile, base_armour, access, notes):
        keys_in_access = {a["_key"] for a in access}
        link_to_key = {a.get("_linkId"): a["_key"] for a in access if a.get("_linkId")}
        for a in access:
            if a.get("_entryId"):
                link_to_key.setdefault(a["_entryId"], a["_key"])
        upgrade_names = {u["bsId"]: u["name"] for u in self.current_upgrades}
        group_to_keys = collections.defaultdict(set)
        for a in access:
            for gid in a.get("_groupIds", ()):
                group_to_keys[gid].add(a["_key"])
        dummy_ctx = Ctx(self.ds, None, None, None, set())
        for m, gres, gdeps in iter_modifiers(profile, dummy_ctx, self.tally):
            field = m.attrib.get("field")
            if field not in self.stat_fields:
                continue
            stat = self.stat_fields[field]
            mtype = m.attrib.get("type")
            conds = list(kids(m, "conditions"))
            groups = kids(m, "conditionGroups")
            complex_group = False
            for g in groups:
                if g.attrib.get("type", "and") == "or" and not kids(g, "conditionGroups"):
                    conds.extend(kids(g, "conditions"))
                else:
                    complex_group = True
            if complex_group or gres is not True:
                self.tally.add(("stat-modifier-complex-condition", stat), unit_id)
                notes.append(f"{stat} modifier '{mtype} {m.attrib.get('value')}' has an unmodelled compound condition")
                continue
            if not conds:
                self.tally.add(("stat-modifier-unconditional", stat), unit_id)
                continue
            for c in conds:
                child = c.attrib.get("childId")
                if c.attrib.get("type") not in POSITIVE:
                    self.tally.add(("stat-modifier-negative-condition", stat), unit_id)
                    continue
                targets = set()
                resolved = self.ds.resolve_target(child)
                if child in keys_in_access:
                    targets.add(child)
                elif child in link_to_key:
                    targets.add(link_to_key[child])
                elif resolved in keys_in_access:
                    targets.add(resolved)
                elif child in group_to_keys:
                    targets |= group_to_keys[child]
                else:
                    tgt = self.ds.get(child)
                    if tgt is not None and self.ds.in_campaign(tgt):
                        self.tally.add(("stat-modifier-campaign-condition", stat))
                    elif child in upgrade_names:
                        self.tally.add(("stat-modifier-upgrade-condition", stat))
                        notes.append(f"{stat} {mtype} {m.attrib.get('value')} with upgrade '{upgrade_names[child]}'")
                    else:
                        self.tally.add(("stat-modifier-unresolved-condition", stat), f"{unit_id}: {self.ds.name_of_id(child)}")
                        notes.append(f"{stat} {mtype} {m.attrib.get('value')} when {self.ds.name_of_id(child)}")
                    continue
                val = first_int(m.attrib.get("value"))
                if val is None:
                    continue
                if stat == "armour":
                    if mtype == "set":
                        delta = val - base_armour
                    elif mtype == "decrement":
                        delta = -val
                    elif mtype == "increment":
                        delta = val
                    else:
                        self.tally.add(("stat-modifier-type", mtype, stat))
                        continue
                else:
                    if mtype == "increment":
                        delta = val
                    elif mtype == "decrement":
                        delta = -val
                    else:
                        # set on ranged/melee strings: not a delta
                        self.tally.add(("stat-modifier-type", mtype, stat))
                        continue
                for key in targets:
                    if stat == "armour":
                        self.armour_votes[key][delta] += 1
                        self.unit_armour_votes.append((unit_id, key, delta))
                    else:
                        self.stat_votes[key][stat][delta] += 1

    # -- equipment access walk ------------------------------------------------------

    def walk_access(self, entry, link, ctx, campaign_links, notes):
        access = []
        upgrades = []
        seen = {}

        def visit(el, via, path, group_ids, inherited, depth, parent_item=None):
            if depth > 8:
                self.tally.add(("walk-depth-exceeded",))
                return
            if el is None:
                return
            name = clean(el.attrib.get("name", "")) or (clean(via.attrib.get("name", "")) if via is not None else "")
            if self.ds.in_campaign(el):
                campaign_links.add(name)
                return
            if "fireteam" in name.lower() and tag(el) == "selectionEntryGroup":
                self.tally.add(("fireteam-group-skipped (distinct groups)",), name, distinct=el.attrib.get("id"))
                return
            state, deps = visibility([el, via], ctx, self.tally)
            if state == "hidden":
                return
            cond = dict(inherited)
            if state == "conditional":
                for k, v in self.deps_fields(deps).items():
                    if k == "conditionNote":
                        parts = set(cond.get(k, "").split("; ")) | set(v.split("; "))
                        cond[k] = "; ".join(sorted(p for p in parts if p))
                    else:
                        cond[k] = sorted(set(cond.get(k, [])) | set(v))
            t = tag(el)
            if t == "selectionEntryGroup":
                gid = el.attrib.get("id")
                new_path = path + [name]
                new_gids = group_ids + [gid] + ([via.attrib.get("id")] if via is not None else [])
                for se in kids(el, "selectionEntries"):
                    visit(se, None, new_path, new_gids, cond, depth + 1, parent_item)
                for ln in kids(el, "entryLinks"):
                    visit(self.ds.get(ln.attrib.get("targetId")), ln, new_path, new_gids, cond, depth + 1, parent_item)
                for sg in kids(el, "selectionEntryGroups"):
                    visit(sg, None, new_path, new_gids, cond, depth + 1, parent_item)
                return
            if t != "selectionEntry":
                return
            if name.endswith("?"):
                # toggles such as Shovel -> "Include Weapon Profile?" are part of the parent item
                self.tally.add(("toggle-sub-entry-skipped",), name, distinct=el.attrib.get("id"))
                return
            refs = self.item_refs_for_entry(el)
            if refs:
                for key, p, source in refs:
                    self.register_item(key, p, el, source)
                    costs = costs_of(el)
                    costs.update(costs_of(via))
                    for other in (el, via):
                        if other is None:
                            continue
                        for m, gres, gdeps in iter_modifiers(other, ctx, self.tally):
                            if m.attrib.get("field") in self.ds.cost_ids:
                                applies = True
                                if list(m) or gres is not True:
                                    # a conditional price only counts when its condition is known to hold
                                    # for this unit (e.g. Bolt-Action Rifle 5 ducats "instanceOf Yeoman")
                                    applies = eval_modifier_conditions(m, ctx, [], self.tally, extra=[gres])
                                    self.tally.add(("modifier", m.attrib.get("type"), "cost", "conditional" if applies is None else "conditional-resolved"), name)
                                else:
                                    self.tally.add(("modifier", m.attrib.get("type"), "cost", "unconditional"), name)
                                if applies is True:
                                    cname = self.ds.cost_ids[m.attrib["field"]]
                                    val = float(m.attrib.get("value", "0") or 0)
                                    mt = m.attrib.get("type")
                                    if mt == "set":
                                        costs[cname] = val
                                    elif mt == "increment":
                                        costs[cname] = costs.get(cname, 0) + val
                                    elif mt == "decrement":
                                        costs[cname] = costs.get(cname, 0) - val
                    parts, cmin, cmax = describe_constraints(self.ds, [el, via], False, self.tally)
                    per_model = None
                    for other in (el, via):
                        if other is None:
                            continue
                        for c in kids(other, "constraints"):
                            if c.attrib.get("type") == "max" and c.attrib.get("scope") in ("parent", "self", "model") and c.attrib.get("field") == "selections":
                                v = first_int(c.attrib.get("value"))
                                per_model = v if per_model is None else min(per_model, v)
                    per_warband = None
                    for other in (el, via):
                        if other is None:
                            continue
                        for c in kids(other, "constraints"):
                            if c.attrib.get("type") == "max" and c.attrib.get("scope") in ("roster", "force") and c.attrib.get("field") == "selections":
                                v = first_int(c.attrib.get("value"))
                                per_warband = v if per_warband is None else min(per_warband, v)
                    fixed = False
                    for other in (el, via):
                        if other is None:
                            continue
                        for c in kids(other, "constraints"):
                            if c.attrib.get("type") == "min" and first_int(c.attrib.get("value")) and c.attrib.get("scope") in ("parent", "self", "model"):
                                fixed = True
                    group_name = path[-1] if path else "direct"
                    dedupe_key = (key, slug(group_name))
                    if dedupe_key in seen:
                        if parent_item:
                            seen[dedupe_key].setdefault("attachesTo", [])
                            if parent_item not in seen[dedupe_key]["attachesTo"]:
                                seen[dedupe_key]["attachesTo"].append(parent_item)
                                seen[dedupe_key]["attachesTo"].sort()
                        continue
                    acc = {
                        "_key": key,
                        "_linkId": via.attrib.get("id") if via is not None else el.attrib.get("id"),
                        "_entryId": el.attrib.get("id"),
                        "_groupIds": group_ids,
                        "group": slug(group_name),
                        "groupPath": "/".join(slug(x) for x in path) if path else "direct",
                        "max": per_model if per_model and per_model > 0 else None,
                    }
                    if costs:
                        acc["cost"] = cost_obj(costs)
                    if per_model is not None and per_model <= 0:
                        acc["note"] = f"source max {per_model} (unlocked by modifier only)"
                    if per_warband is not None and per_warband > 0:
                        acc["maxPerWarband"] = per_warband
                    if fixed:
                        acc["fixed"] = True
                    if len(refs) > 1:
                        acc["bundle"] = name
                    if parent_item:
                        acc["attachesTo"] = [parent_item]
                    if parts:
                        acc["limitsText"] = "; ".join(parts)
                    for k, v in cond.items():
                        acc[k] = v
                    self.item_link_costs[key].append((costs.get(DUCATS), costs.get(GLORY)))
                    self.item_faction_ids[key].add(ctx.faction_cat_id)
                    self.item_defs[key]["groups"].add(slug(group_name))
                    seen[dedupe_key] = acc
                    access.append(acc)
            else:
                texts = self.named_texts(el)
                costs = costs_of(el)
                if texts or any(costs.values()):
                    if "(Loaded)" in name:
                        return
                    up = {"name": name, "bsId": el.attrib.get("id"), "group": slug(path[-1]) if path else "direct", "rules": texts}
                    if costs:
                        up["cost"] = cost_obj(costs)
                    parts, _, _ = describe_constraints(self.ds, [el, via], False, self.tally)
                    for other in (el, via):
                        if other is None:
                            continue
                        for c in kids(other, "constraints"):
                            if c.attrib.get("type") != "max" or c.attrib.get("field") != "selections":
                                continue
                            v = first_int(c.attrib.get("value"))
                            if v is None or v <= 0:
                                continue
                            if c.attrib.get("scope") in ("parent", "self", "model"):
                                up["max"] = v if up.get("max") is None else min(up["max"], v)
                            elif c.attrib.get("scope") in ("roster", "force"):
                                up["maxPerWarband"] = v if up.get("maxPerWarband") is None else min(up["maxPerWarband"], v)
                    if parts:
                        up["limitsText"] = "; ".join(parts)
                    for k, v in cond.items():
                        up[k] = v
                    upgrades.append(up)
            # nested content of an entry (e.g. weapon -> Bayonet group, Shovel -> weapon profile)
            nested_parent = name if refs else parent_item
            for se in kids(el, "selectionEntries"):
                visit(se, None, path, group_ids, cond, depth + 1, nested_parent)
            for ln in kids(el, "entryLinks"):
                target = self.ds.get(ln.attrib.get("targetId"))
                if target is not None and tag(target) == "selectionEntryGroup" and "Ammunition" in clean(ln.attrib.get("name", "")):
                    self.tally.add(("ammunition-loaded-group-skipped (distinct weapons)",), name, distinct=el.attrib.get("id"))
                    continue
                visit(target, ln, path, group_ids, cond, depth + 1, nested_parent)
            for sg in kids(el, "selectionEntryGroups"):
                visit(sg, None, path, group_ids, cond, depth + 1, nested_parent)

        roots = []
        for holder in (entry, link):
            if holder is None:
                continue
            for ln in kids(holder, "entryLinks"):
                roots.append((self.ds.get(ln.attrib.get("targetId")), ln))
            for sg in kids(holder, "selectionEntryGroups"):
                roots.append((sg, None))
            for se in kids(holder, "selectionEntries"):
                roots.append((se, None))
        for el, via in roots:
            visit(el, via, [], [], {}, 0)
        access.sort(key=lambda a: (a["group"], a["_key"]))
        upgrades.sort(key=lambda u: (u["group"], u["name"]))
        return access, upgrades

    # -- finalisation --------------------------------------------------------------

    def finalise_items(self):
        # merge by slug: library > faction entry > bare profile
        by_slug = collections.defaultdict(list)
        for key, d in self.item_defs.items():
            by_slug[slug(d["name"])].append(d)
        self.items = []
        for s, defs in sorted(by_slug.items()):
            defs.sort(key=lambda d: (0 if d["library"] else (1 if d["entry"] is not None else 2), d["key"]))
            primary = defs[0]
            item_id = s
            cat = self.category_of(primary)
            if cat == "ammunition":
                item_id = f"ammo/{s}"
            for d in defs:
                self.merged_key[d["key"]] = item_id
            ch = primary["chars"]
            link_costs = []
            for d in defs:
                link_costs.extend(self.item_link_costs.get(d["key"], []))
            own_costs = costs_of(primary["entry"]) if primary["entry"] is not None else {}
            if own_costs and (own_costs.get(DUCATS) or own_costs.get(GLORY)):
                cost = cost_obj(own_costs)
            else:
                duc = collections.Counter(c[0] for c in link_costs if c[0] is not None)
                glo = collections.Counter(c[1] for c in link_costs if c[1] is not None)
                cost = cost_obj({DUCATS: duc.most_common(1)[0][0] if duc else None, GLORY: glo.most_common(1)[0][0] if glo else None})
                if own_costs:
                    if cost["ducats"] is None and DUCATS in own_costs:
                        cost["ducats"] = number_or_none(own_costs[DUCATS])
                    if cost["glory"] is None and GLORY in own_costs:
                        cost["glory"] = number_or_none(own_costs[GLORY])
            modifiers = []
            votes = collections.Counter()
            for d in defs:
                votes.update(self.armour_votes.get(d["key"], {}))
            if votes:
                best = sorted(votes.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
                modifiers.append({"stat": "armour", "delta": best})
                self.chosen_armour = getattr(self, "chosen_armour", {})
                for d in defs:
                    self.chosen_armour[d["key"]] = best
            for d in defs:
                for stat, cnt in self.stat_votes.get(d["key"], {}).items():
                    best = sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
                    if not any(m["stat"] == stat for m in modifiers):
                        modifiers.append({"stat": stat, "delta": best})
                for stat, delta in d["stat_mods"].items():
                    if not any(m["stat"] == stat for m in modifiers):
                        modifiers.append({"stat": stat, "delta": delta})
            modifiers.sort(key=lambda m: m["stat"])
            limits_parts = []
            if primary["entry"] is not None:
                parts, _, _ = describe_constraints(self.ds, [primary["entry"]], False, self.tally)
                limits_parts = parts
            rng = ch.get("Range", "")
            item = {
                "id": item_id,
                "bsId": primary["key"],
                "name": primary["name"],
                "category": cat,
                "hands": self.hands_of(primary),
                "cost": cost,
                "range": rng if rng and rng != "-" else None,
                "keywords": split_keywords(ch.get("Keywords", "")),
                "rules": ch.get("Rules", "") if ch.get("Rules", "") != "-" else "",
                "modifiers": modifiers,
                "limits": "; ".join(limits_parts) if limits_parts else None,
                "type": ch.get("Type", ""),
                "source": primary["owner"],
            }
            if primary["page"]:
                item["page"] = primary["page"]
            if primary["profileName"] != primary["name"]:
                item["bsName"] = primary["profileName"]
            if len(defs) > 1:
                item["bsIds"] = sorted(d["key"] for d in defs)
                variants = {json.dumps(d["chars"], sort_keys=True) for d in defs}
                if len(variants) > 1:
                    item["mergedProfilesDiffer"] = True
                    self.notes["merged-profile-conflicts"].append(f"{item_id}: " + " | ".join(f"{d['owner']}:{d['key']}" for d in defs))
            if not primary["library"]:
                fids = set()
                for d in defs:
                    for cid in self.item_faction_ids.get(d["key"], ()):
                        fids.add(slug(self.ds.catalogues[cid]["name"]))
                item["factionIds"] = sorted(fids)
            self.items.append(item)
        self.items.sort(key=lambda i: i["id"])

    def category_of(self, d):
        ch = d["chars"]
        t = ch.get("Type", "").lower()
        rng = ch.get("Range", "").lower()
        kw = ch.get("Keywords", "").upper()
        groups = d["groups"]
        if "grenade" in t or "grenades" in groups:
            return "grenade"
        if t == "shield" or "shield" in d["name"].lower() and d["profileType"] == "Battlekit":
            return "shield"
        if t == "armour" or ("armour" in groups and d["profileType"] == "Battlekit"):
            return "armour"
        if "AMMUNITION" in kw and d["profileType"] == "Battlekit":
            return "ammunition"
        if d["profileType"] == "Weapon":
            if rng.startswith("melee") or rng == "":
                return "melee"
            return "ranged"
        return "equipment"

    def hands_of(self, d):
        t = d["chars"].get("Type", "").lower()
        if t.startswith("1-"):
            return 1
        if t.startswith("2-"):
            return 2
        for g in d["groups"]:
            if "one-handed" in g:
                return 1
            if "two-handed" in g:
                return 2
        return None

    def finalise_units(self):
        chosen = getattr(self, "chosen_armour", {})
        disagreements = collections.defaultdict(list)
        for unit_id, key, delta in self.unit_armour_votes:
            best = chosen.get(key)
            if best is not None and best != delta:
                disagreements[unit_id].append(f"armour with {self.merged_key.get(key, key)} is {delta:+d} here (library item says {best:+d})")
        for unit in self.units:
            for a in unit["equipmentAccess"]:
                a["itemId"] = self.merged_key.get(a["_key"], a["_key"])
                for k in ("_key", "_linkId", "_entryId", "_groupIds"):
                    a.pop(k, None)
            unit["equipmentAccess"].sort(key=lambda a: (a["group"], a["itemId"]))
            extra = disagreements.get(unit["id"])
            if extra:
                unit["notes"] = "; ".join(filter(None, [unit.get("notes"), *extra]))
        self.units.sort(key=lambda u: u["id"])

    # -- output ----------------------------------------------------------------------

    def source_block(self, commit):
        cats = {}
        for c in sorted(self.ds.catalogues.values(), key=lambda c: c["name"]):
            if c["kind"] == "cat":
                cats[c["name"]] = {"file": c["file"], "revision": c["revision"], "bsId": c["id"]}
        return {
            "repo": REPO_URL,
            "commit": commit,
            "file": self.ds.gst["file"],
            "edition": f"BattleScribe gameSystem '{self.ds.gst['name']}' revision {self.ds.gst['revision']}",
            "gameSystem": {"file": self.ds.gst["file"], "revision": self.ds.gst["revision"], "bsId": self.ds.gst["id"]},
            "catalogues": cats,
            "generator": "scripts/convert_newrecruit.py",
        }


def split_keywords(text):
    if not text or text == "-":
        return []
    return [clean(k) for k in text.split(",") if clean(k)]


# Report -----------------------------------------------------------------------------


def write_notes(conv, out_dir, commit):
    lines = []
    lines.append("# NewRecruit dataset conversion notes")
    lines.append("")
    lines.append(f"Generated by `scripts/convert_newrecruit.py` from {REPO_URL} @ `{commit}`.")
    lines.append(f"Game system `{conv.ds.gst['file']}` revision {conv.ds.gst['revision']}; catalogue revisions are in each JSON `source` block.")
    lines.append("")
    lines.append("## Counts")
    lines.append("")
    lines.append(f"- factions: {len(conv.factions)}")
    lines.append(f"- units: {len(conv.units)} (one row per unit per faction; mercenaries repeat per faction)")
    per_f = collections.Counter(u["factionId"] for u in conv.units)
    merc_f = collections.Counter(u["factionId"] for u in conv.units if u.get("mercenary"))
    for f in conv.factions:
        lines.append(f"  - {f['name']}: {per_f[f['id']]} units ({merc_f[f['id']]} mercenaries), {len(f['variants'])} variants")
    lines.append(f"- equipment items: {len(conv.items)}")
    per_c = collections.Counter(i["category"] for i in conv.items)
    for c, n in sorted(per_c.items()):
        lines.append(f"  - {c}: {n}")
    lib = sum(1 for i in conv.items if "factionIds" not in i)
    lines.append(f"  - shared-library items: {lib}; faction/mercenary-local items: {len(conv.items) - lib}")
    lines.append("")
    lines.append("## How the mapping works")
    lines.append("")
    lines.append("- Unit availability per faction = faction root `selectionEntries` (type model/unit) + faction root `entryLinks` to models + the Mercenaries catalogue root entries (imported with `importRootEntries=\"true\"`), each filtered through its `hidden` flag and `set hidden` modifiers evaluated with three-valued logic (known: this unit/its categories/the primary catalogue; unknown: roster selections such as variants).")
    lines.append("- Entries that stay hidden with no reachable unhide path are dropped and listed below. Entries whose visibility depends on a roster selection are kept with `onlyWith` / `onlyWithout` (readable names; variant ids where the dependency is a Warband Variant) and `variantIds`.")
    lines.append("- `equipmentAccess` is the flattened walk of every selection group reachable from the unit (shared faction groups such as Weapons/Armour/Equipment/Grenades, plus unit-local groups). `group` is the innermost BS group slug, `groupPath` the full path. The cost on the link wins over the library entry's cost. Items hidden for this unit are omitted; conditionally hidden ones carry `onlyWith`/`onlyWithout`/`conditionNote`.")
    lines.append("- Selections inside those groups that carry no Weapon/Battlekit *item* profile (Battlekit profiles with an empty Type are abilities) are emitted under the unit's `upgrades` extra field instead.")
    lines.append("- Armour/shield `modifiers` on items are derived from the Unit-profile modifiers (set/decrement/increment on the Armour characteristic conditioned on a selection); the most common delta across units wins and any unit that disagrees says so in its `notes`.")
    lines.append("- Equipment items are merged by name slug across the three libraries, faction catalogues and game-system shared profiles (library entry preferred). Merged ids are listed in `bsIds`; `mergedProfilesDiffer` flags merges whose characteristics differ.")
    lines.append("- Mercenary unit ids are `<faction-id>/<slug>` (unique per faction row) with `mercenary: true` and a shared `mercenaryId` (`mercenary/<slug>`), because the same mercenary appears once per faction with that faction's price.")
    lines.append("- `startingDucats` / `threshold` are not encoded anywhere in the dataset (no costLimits, no configuration entry), so they are omitted.")
    lines.append("- The crown (ducats) and sun (glory) glyphs do not occur in this revision; the converter still strips them from text.")
    lines.append("")
    lines.append("## Unmodelled BattleScribe constructs (counts)")
    lines.append("")
    lines.append("Counted every time the converter met a construct it could only partially model or had to skip.")
    lines.append("")
    for key, n in sorted(conv.tally.counts.items(), key=lambda kv: (-kv[1], str(kv[0]))):
        ex = conv.tally.examples.get(key)
        lines.append(f"- {n} x `{' / '.join(str(k) for k in key)}`" + (f" (e.g. {ex})" if ex else ""))
    lines.append("")
    lines.append("Not attempted at all: roster-level `error` messages (captured as text in `rosterErrors`/`notes` only), `repeat` based constraint scaling, conditional cost discounts (variant price changes), name-changing modifiers (captured as notes), category add/remove with conditions, constraint modifiers (captured in `limits.text`), the Campaign Rules catalogue (skills, injuries, glory items, exploration upgrades, patron selection).")
    lines.append("")
    lines.append("## Dropped (hidden with no unhide path for that faction)")
    lines.append("")
    for n, facs in sorted(conv.hidden_units.items()):
        lines.append(f"- {n}: hidden for {', '.join(sorted(set(facs)))}")
    lines.append("")
    lines.append("## Campaign Rules links seen on units (out of scope, recorded by name)")
    lines.append("")
    for f in conv.factions:
        lines.append(f"- {f['name']}: {', '.join(f['campaignLinks']) or 'none'}")
    lines.append("")
    lines.append("## Merged item profiles that differ")
    lines.append("")
    for n in sorted(set(conv.notes.get("merged-profile-conflicts", []))):
        lines.append(f"- {n}")
    if not conv.notes.get("merged-profile-conflicts"):
        lines.append("- none")
    lines.append("")
    lines.append("## Known upstream oddities noticed")
    lines.append("")
    for n in UPSTREAM_ODDITIES:
        lines.append(f"- {n}")
    lines.append("")
    lines.append("## Open questions for the PDF diff (TC-003)")
    lines.append("")
    for n in OPEN_QUESTIONS:
        lines.append(f"- {n}")
    lines.append("")
    with open(os.path.join(out_dir, "CONVERSION-NOTES.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


UPSTREAM_ODDITIES = [
    "The `Fireteam` (type=unit) entries are marked by the author as deprecated ('being phased out') and are hidden unless already on a roster; they carry no Unit profile, so their stats are placeholders (`kind: fireteam`, `members` lists the eligible models).",
    "Mercenary availability is gated with `primary-catalogue` conditions; the Sister of Saint Cosmas entry carries the author comment 'impossible because I dont really wanna *delete* them' and only unhides for Trench Pilgrims.",
    "Faction catalogues cross-link each other (Heretic Legion imports Iron Sultanate and New Antioch, Court imports Pilgrims and Sultanate, Black Grail imports Heretic Legion) without `importRootEntries`, so only shared groups/entries leak across, not units.",
    "The `Weapon` characteristic `Type` is inconsistently cased (`Grenade` vs `GRENADE`), `Range` mixes straight and curly quotes, and keywords contain non-breaking spaces; all normalised here.",
    "Several library items have no cost in the library (price lives on each faction's link). Items that no faction links (e.g. hidden library entries) get a null cost.",
    "Author comments such as 'fuckin hell, homebrew' and 'stolen from sultans to account for the homonculus' sit inside condition groups on the New Antioch Melee Weapons group, i.e. the hand-count logic there is acknowledged as fragile upstream.",
    "'Startling Speed' (gst Takwin Homunculus formula) and 'Mendelist Ammo Monk ' have leading/trailing whitespace in their names (recorded in `bsName`).",
    "Movement typos survive in `stats.movement.raw`/`type`: 'Infantery' (Disciple of St. Roch, Chieftain) and '6\"/Dly' (Witch Coven Matriarch); the Mendelist Ammo Monk has Armour '-' (converted to 0 with a note).",
    "The Court's purchasable Infernal Iron Armour (Armour group) is disabled with a `never` condition, so only the built-in Infernal Iron Armour profile on Hell Knights etc. exists (`builtInEquipment`); unit-profile armour modifiers that still reference the disabled entry are listed in `notes` as unresolved.",
    "Unit profiles share a copy-pasted armour-modifier template, so units that cannot reach the Shields/Armour groups (Matagot Hag, Witch Coven Matriarch, Pairika, Shirdal, Lion of Jabir, Amalgam) still carry modifiers for Standard/Reinforced/Machine Armour and Shields; these surface as `notes` ('armour set ... when ...') and are not applied.",
    "Reinforced Armour is `hidden=\"true\"` in the Battlekits library yet linked `hidden=\"false\"` (sometimes with min=1) by every faction and mercenary; the converter therefore lets the link's own flag govern and only inherits a target's hidden flag when the target carries its own hide/unhide modifiers (Butcher Bayonet).",
    "The Unit profile for the Sister of Saint Cosmas is named 'Combat Medic' (copy-paste) and uses '0' rather than '+0 Dice' for Ranged/Melee.",
    "Armour values are encoded on the unit profile as conditional modifiers (one per armour/shield selection) rather than on the armour items, and the per-unit deltas are not always consistent (see unit `notes`).",
]

OPEN_QUESTIONS = [
    "Per-faction equipment prices: every `equipmentAccess.cost` should be spot-checked against the faction equipment tables, especially where a faction link overrides the library (Reinforced Armour, Machine Armour, Misericordia, grenades).",
    "Armour deltas derived by vote (`equipment.json` `modifiers`): confirm Standard Armour -1, Reinforced Armour -2, Machine Armour -3, Trench Shield -1 and the faction-specific shields against the rulebook; check every unit whose `notes` records a disagreement.",
    "Units kept only with `onlyWith`/`onlyWithout`/`conditionNote` (variant-locked units, Homunculi behind 'Book of Golems', Anqa Guard, Technomancer, Witch Coven Matriarch, Trench Ghosts gating of the Scripture Guardian): confirm the rulebook availability text.",
    "Mercenary prices are glory-only in this dataset (Scripture Guardian 7 GP, Mamluk Faris 4 GP, Goetic Warlock 4 GP + 110 ducats modifier); confirm ducat prices and which factions may hire each.",
    "Warband limits (`limits.min/max`) come from roster-scope constraints; constraints that are modified by variants are only captured as text in `limits.text` and need the variant tables checked.",
    "Starting ducats (700) and the Threshold table are not in the dataset and must come from the rulebook extraction.",
    "The `Fireteam` wrapper units are deprecated upstream: decide whether the campaign app keeps them or models fireteams from the rulebook text only.",
    "Items merged by name across catalogues with `mergedProfilesDiffer: true` need a human to pick the correct profile.",
]


# Main --------------------------------------------------------------------------------


def git_commit(src):
    try:
        out = subprocess.run(["git", "-C", src, "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
        return out.stdout.strip()
    except Exception:  # noqa: BLE001 - any failure means we simply do not know the commit
        return "unknown"


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, sort_keys=True, ensure_ascii=False)
        fh.write("\n")


# PDF overrides -------------------------------------------------------------------

OVERRIDE_COLLECTIONS = {"units.json": "units", "equipment.json": "items", "factions.json": "factions"}
_SEG_RE = re.compile(r"^([A-Za-z0-9_$-]+)(?:\[([A-Za-z0-9_$.-]+)=(.*)\])?$")


def _coerce(raw, sample):
    """A selector value is matched as a number when the field holds numbers, else as text."""
    if isinstance(sample, bool) or sample is None:
        return raw
    if isinstance(sample, (int, float)):
        try:
            return type(sample)(raw)
        except ValueError:
            return raw
    return raw


def resolve_override_path(root, path):
    """Return (container, key) for a dot path such as `cost.ducats` or
    `equipmentAccess[itemId=standard-armour].cost.ducats`; raise KeyError when a
    segment cannot be found. A `list[key=value]` segment selects exactly one element."""
    node = root
    segments = path.split(".")
    i = 0
    while i < len(segments):
        seg = segments[i]
        # a selector value may itself contain dots (e.g. [name=St. Roch]); re-join until the bracket closes
        while seg.count("[") > seg.count("]") and i + 1 < len(segments):
            i += 1
            seg += "." + segments[i]
        m = _SEG_RE.match(seg)
        if not m:
            raise KeyError(f"bad segment {seg!r}")
        name, skey, sval = m.group(1), m.group(2), m.group(3)
        last = i == len(segments) - 1
        if not isinstance(node, dict) or name not in node:
            if last and skey is None and isinstance(node, dict):
                return node, name  # a new field may be created on the final segment
            raise KeyError(f"no field {name!r}")
        if skey is None:
            if last:
                return node, name
            node = node[name]
        else:
            lst = node[name]
            if not isinstance(lst, list):
                raise KeyError(f"{name!r} is not a list")
            hits = [x for x in lst if isinstance(x, dict) and skey in x and str(x[skey]) == str(_coerce(sval, x[skey]))]
            if len(hits) != 1:
                raise KeyError(f"{name}[{skey}={sval}] matched {len(hits)} elements")
            if last:
                return lst, lst.index(hits[0])
            node = hits[0]
        i += 1
    raise KeyError("empty path")


def apply_overrides(overrides_path, outputs):
    """Apply every override in the file to the in-memory outputs ({file: payload}).
    Prints one line per applied override; returns the list of overrides it could not resolve."""
    with open(overrides_path, encoding="utf-8") as fh:
        spec = json.load(fh)
    if spec.get("$schema") != "tc-rules-pdf-overrides-v1":
        raise SystemExit(f"{overrides_path}: unexpected $schema {spec.get('$schema')!r}")
    failures = []
    applied = 0
    for ov in spec.get("overrides", []):
        fname, eid, path = ov.get("file"), ov.get("id"), ov.get("path")
        coll = OVERRIDE_COLLECTIONS.get(fname)
        payload = outputs.get(fname)
        label = f"{fname}:{eid}:{path}"
        if coll is None or payload is None:
            failures.append((label, f"unknown file {fname!r}"))
            continue
        entries = [e for e in payload[coll] if e.get("id") == eid]
        if len(entries) != 1:
            failures.append((label, f"id matched {len(entries)} entries"))
            continue
        try:
            container, key = resolve_override_path(entries[0], path)
        except KeyError as exc:
            failures.append((label, str(exc)))
            continue
        current = container[key] if (isinstance(container, dict) and key in container) or isinstance(container, list) else None
        if "upstream" in ov and current != ov["upstream"]:
            print(f"  warning: {label} upstream value is {json.dumps(current, ensure_ascii=False)}, override expected {json.dumps(ov['upstream'], ensure_ascii=False)}")
        if ov.get("pdf", "__missing__") == "__missing__":
            failures.append((label, "override has no 'pdf' value"))
            continue
        if ov["pdf"] is None:
            # null removes a list element or drops a field (e.g. an onlyWith gate)
            if isinstance(container, list):
                del container[key]
            else:
                container.pop(key, None)
            applied += 1
            print(f"  override {label}: removed")
            continue
        container[key] = ov["pdf"]
        applied += 1
        print(f"  override {label}: {json.dumps(current, ensure_ascii=False)} -> {json.dumps(ov['pdf'], ensure_ascii=False)}")
    print(f"applied {applied} override(s) from {overrides_path}")
    return failures


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="path to the Fawkstrot11/TrenchCrusade clone")
    ap.add_argument("--out", required=True, help="output directory (data/rules)")
    ap.add_argument(
        "--overrides",
        default=None,
        help="PDF overrides file applied as the last step (default: <out>/pdf-overrides.json when it exists; pass '' to skip)",
    )
    args = ap.parse_args(argv)
    ds = Dataset(args.src)
    if ds.gst is None:
        print("no .gst file found in --src", file=sys.stderr)
        return 2
    conv = Converter(ds)
    conv.convert()
    commit = git_commit(args.src)
    source = conv.source_block(commit)
    os.makedirs(args.out, exist_ok=True)
    outputs = {
        "factions.json": {"$schema": "tc-rules-factions-v1", "source": source, "factions": sorted(conv.factions, key=lambda f: f["id"])},
        "units.json": {"$schema": "tc-rules-units-v1", "source": source, "units": conv.units},
        "equipment.json": {"$schema": "tc-rules-equipment-v1", "source": source, "items": conv.items},
    }
    overrides_path = args.overrides
    if overrides_path is None:
        candidate = os.path.join(args.out, "pdf-overrides.json")
        overrides_path = candidate if os.path.exists(candidate) else ""
    if overrides_path:
        failures = apply_overrides(overrides_path, outputs)
        if failures:
            print(f"{len(failures)} override(s) could not be resolved:", file=sys.stderr)
            for label, why in failures:
                print(f"  {label}: {why}", file=sys.stderr)
            return 3
        with open(overrides_path, encoding="utf-8") as fh:
            ov_source = json.load(fh).get("source", {})
        for payload in outputs.values():
            payload["source"]["pdfOverrides"] = {"file": os.path.basename(overrides_path), **ov_source}
    for fname, payload in outputs.items():
        dump(os.path.join(args.out, fname), payload)
    write_notes(conv, args.out, commit)
    print(f"factions={len(conv.factions)} units={len(conv.units)} items={len(conv.items)} -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
