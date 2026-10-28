from pathlib import Path
from PIL import Image
from collections import deque
import json


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ATLAS = ASSETS / "source-sheets"

CELLS = [
    ("head", 0, 0), ("torso", 0, 1), ("pelvis", 0, 2), ("tassel", 0, 3),
    ("far-upper-arm", 1, 0), ("far-forearm", 1, 1), ("far-hand", 1, 2), ("weapon", 1, 3),
    ("near-upper-arm", 2, 0), ("near-forearm", 2, 1), ("near-hand", 2, 2), ("extra", 2, 3),
    ("far-thigh", 3, 0), ("far-shin", 3, 1), ("far-foot", 3, 2), ("robe-back", 3, 3),
    ("near-thigh", 4, 0), ("near-shin", 4, 1), ("near-foot", 4, 2), ("robe-front", 4, 3),
]


def trim_cell(sheet, box):
    x0, y0, x1, y1 = box
    rgba = sheet.crop((x0, y0, x1, y1)).convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: value if value >= 12 else 0)
    width, height = alpha.size
    alpha_pixels = alpha.load()
    mask = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            mask[y * width + x] = alpha_pixels[x, y] > 35
    visited = bytearray(width * height)
    components = []
    for start, active in enumerate(mask):
        if not active or visited[start]:
            continue
        visited[start] = 1
        queue = deque([start])
        pixels = []
        touches_cell_edge = False
        while queue:
            index = queue.popleft()
            pixels.append(index)
            y, x = divmod(index, width)
            touches_cell_edge |= x == 0 or y == 0 or x == width - 1 or y == height - 1
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = ny * width + nx
                    if mask[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        components.append((pixels, touches_cell_edge))
    largest = max((len(pixels) for pixels, _ in components), default=0)
    for pixels, touches_edge in components:
        if len(pixels) < max(16, largest * .035) or (touches_edge and len(pixels) < largest * .12):
            for index in pixels:
                alpha_pixels[index % width, index // width] = 0
    rgba.putalpha(alpha)
    bounds = alpha.point(lambda value: 255 if value > 40 else 0).getbbox()
    if not bounds:
        raise ValueError(f"No visible artwork in atlas cell row={row}, column={column}")
    left, top, right, bottom = bounds
    part = rgba.crop(bounds)
    padded = Image.new("RGBA", (part.width + 8, part.height + 8), (0, 0, 0, 0))
    padded.alpha_composite(part, (4, 4))
    return padded, (x0 + left - 4, y0 + top - 4)


# The generated atlases have uneven gutters. These bounds follow the actual
# artwork, rather than assuming that twenty equal rectangles are safe crops.
BOUNDS = {
    "warrior": [
        (30,0,280,240), (285,45,490,240), (515,60,720,235), (735,0,1015,240),
        (85,240,220,428), (330,245,450,428), (530,255,700,420), (735,230,980,440),
        (55,428,230,615), (345,430,450,615), (550,435,690,610), (750,435,1000,615),
        (45,615,240,810), (345,615,450,810), (525,615,705,810), (745,615,1000,810),
        (65,810,230,1024), (345,810,450,1024), (525,810,705,1024), (745,810,1000,1024),
    ],
    "scholar": [
        (70,0,420,492), (450,50,770,492), (815,120,1130,492), (1150,0,1580,492),
        (155,502,390,848), (500,502,710,848), (875,540,1040,830), (1140,510,1545,840),
        (150,855,390,1190), (505,855,715,1190), (880,885,1055,1175), (1140,855,1545,1190),
        (100,1205,350,1580), (520,1205,705,1580), (810,1240,1080,1580), (1170,1205,1540,1580),
        (100,1595,345,1990), (515,1595,705,1990), (810,1595,1080,1990), (1150,1595,1540,1990),
    ],
}

# Rivet and grip locations measured on the source atlases. Keeping them in
# source coordinates makes the rig independent of transparent crop padding.
ANCHORS = {
    "warrior": {
        "head": [(154,224)], "torso": [(390,84),(395,216)],
        "pelvis": [(621,95),(621,215)], "tassel": [(782,213)],
        "far-upper-arm": [(126,267),(170,403)],
        "far-forearm": [(401,274),(366,403)], "far-hand": [(650,375)],
        "near-upper-arm": [(171,447),(112,577)],
        "near-forearm": [(392,447),(400,584)], "near-hand": [(643,463)],
        "weapon": [(850,340)], "tail": [(791,454)],
        "far-thigh": [(184,636),(165,777)], "far-shin": [(392,630),(393,783)],
        "near-thigh": [(146,830),(148,975)], "near-shin": [(394,831),(397,984)],
        "far-foot": [(602,650)], "near-foot": [(604,849)],
        "robe-back": [(858,640)], "robe-front": [(860,839)],
    },
    "scholar": {
        "head": [(234,427)], "torso": [(603,91),(605,390)],
        "pelvis": [(966,185),(965,450)], "tassel": [(1240,420)],
        "far-upper-arm": [(227,535),(343,815)],
        "far-forearm": [(649,552),(541,804)], "far-hand": [(959,596)],
        "near-upper-arm": [(213,898),(350,1157)],
        "near-forearm": [(665,903),(556,1144)], "near-hand": [(1014,932)],
        "weapon": [(1201,795)], "weapon-secondary": [(1197,1131)],
        "far-thigh": [(254,1229),(176,1544)], "far-shin": [(594,1229),(625,1546)],
        "near-thigh": [(245,1614),(169,1929)], "near-shin": [(584,1615),(633,1930)],
        "far-foot": [(940,1285)], "near-foot": [(947,1631)],
        "robe-back": [(1270,1232)], "robe-front": [(1345,1627)],
    },
}


def horizontal_joint(image, y_fraction):
    y = min(image.height - 1, max(0, round((image.height - 1) * y_fraction)))
    band = image.getchannel("A").crop((0, max(0, y - 2), image.width, min(image.height, y + 3)))
    weights = [sum(band.getpixel((x, row)) for row in range(band.height)) for x in range(image.width)]
    total = sum(weights)
    x = sum(index * weight for index, weight in enumerate(weights)) / total if total else image.width / 2
    return [round(x, 2), round(float(y), 2)]


def joint_spec(key, image):
    width, height = image.size
    if key == "head":
        return {"joints": [[round(width * .69, 2), round(height * .94, 2)]]}
    if key == "torso":
        return {
            "joints": [horizontal_joint(image, .04), horizontal_joint(image, .96)],
            "shoulders": [[round(width * .2, 2), round(height * .25, 2)],
                          [round(width * .8, 2), round(height * .25, 2)]],
        }
    if key == "pelvis":
        return {"joints": [horizontal_joint(image, .04), horizontal_joint(image, .96)]}
    if key in {"near-upper-arm", "far-upper-arm", "near-forearm", "far-forearm",
               "near-thigh", "far-thigh", "near-shin", "far-shin"}:
        return {"joints": [horizontal_joint(image, .06), horizontal_joint(image, .94)]}
    if key in {"near-hand", "far-hand"}:
        return {"joints": [horizontal_joint(image, .12)]}
    if key in {"near-foot", "far-foot"}:
        return {"joints": [horizontal_joint(image, .2)]}
    if key == "tassel":
        return {"joints": [horizontal_joint(image, .88)]}
    if key in {"robe-front", "robe-back"}:
        return {"joints": [horizontal_joint(image, .04)]}
    if key == "weapon":
        return {"joints": [[round(width * .92, 2), round(height * .92, 2)]]}
    if key == "weapon-secondary":
        return {"joints": [[round(width * .08, 2), round(height * .9, 2)]]}
    if key == "tail":
        return {"joints": [[round(width * .12, 2), round(height * .1, 2)]]}
    return {"joints": [horizontal_joint(image, .08)]}


def build_actor(actor, atlas_name, label, extra_part):
    sheet = Image.open(ATLAS / atlas_name).convert("RGBA")
    directory = ASSETS / actor
    directory.mkdir(parents=True, exist_ok=True)
    parts = {}
    for index, (key, row, column) in enumerate(CELLS):
        if key == "extra":
            key = extra_part
        if key == "weapon" and actor == "scholar":
            key = "weapon"
        image, origin = trim_cell(sheet, BOUNDS[actor][index])
        image.save(directory / f"{key}.png", optimize=True)
        parts[key] = {**joint_spec(key, image), "size": list(image.size)}
        local = lambda point: [round(point[0] - origin[0], 2), round(point[1] - origin[1], 2)]
        parts[key]["joints"] = [local(point) for point in ANCHORS[actor][key]]
        if actor == "warrior" and key == "far-hand":
            parts[key]["direction"] = local((568,310))
        if key == "torso":
            shoulders = [(335,107),(436,107)] if actor == "warrior" else [(493,164),(721,164)]
            parts[key]["shoulders"] = [local(point) for point in shoulders]
        if key == "head" and actor == "scholar":
            parts[key]["plumeAnchor"] = local((311,115))
    return {"label": label, "parts": parts}


manifest = {
    "warrior": build_actor("warrior", "wukong-atlas-clean.png", "孙悟空", "tail"),
    "scholar": build_actor("scholar", "bone-demon-atlas.png", "白骨精", "weapon-secondary"),
}
# Keep the edited grasp sprite and its measured palm anchor when rebuilding.
grip_sprite = Image.open(ASSETS / 'overrides' / 'wukong-grip.png').convert('RGBA')
grip_sprite.save(ASSETS / 'warrior' / 'near-hand.png', optimize=True)
manifest['warrior']['parts']['near-hand'] = {
    'joints': [[79, 20]], 'size': list(grip_sprite.size),
    'grip': [38, 89], 'gripAxis': [39, 92], 'targetHeight': 62,
}
manifest['warrior']['parts']['far-hand']['flipX'] = True
manifest['warrior']['parts']['weapon']['axis'] = [1, 1]
(ASSETS / "rig.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print("Built", sum(len(actor["parts"]) for actor in manifest.values()), "parts for 孙悟空 and 白骨精")
