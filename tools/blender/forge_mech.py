"""Forge Mech — a Blender template for walkers the Walker Bestiary can load.

Run it from Blender's Scripting tab (open this file, press Run Script), or install it as an
add-on. A "Forge" tab appears in the 3D view's sidebar (press N) with three buttons:

  New mech     builds a labelled starter mech: a body plate, a head and 1-4 pairs of legs, each
               leg a thigh, a shin and three markers (hip, knee, foot) you move to your joints.
  Check        lists anything the Bestiary would trip on.
  Export GLB   writes a .glb with every piece labelled, ready to drop into the Bestiary.

The rules (the starter mech already follows them):
  - Front is -Y (Blender's Front view looks at the mech's face). Up is +Z.
  - Body and Head are built whole, centred on X = 0. Body pieces get domed in the Bestiary
    (how much is the Dome setting); the Head is drawn exactly as built.
  - Legs are built on ONE side only, the +X side (your right in Front view); the Bestiary mirrors
    them. The grey legs on the other side are a live mirror preview and are not exported.
  - Each leg has two rigid pieces. Anything in "Leg N Thigh" swings at the Hip marker, anything in
    "Leg N Shin" at the Knee marker. The Foot marker is where the leg touches the ground.
  - Leg 1 is the front pair. Any piece can be a mesh or a curve (an imported SVG, extruded).

Blender 4.2 or newer.
"""

bl_info = {
    "name": "Forge Mech",
    "author": "Zac / Forge",
    "version": (1, 0, 0),
    "blender": (4, 2, 0),
    "location": "3D View > Sidebar > Forge",
    "description": "Starter mech and labelled GLB export for the Walker Bestiary",
    "category": "Import-Export",
}

import math
import bpy
import bmesh
from mathutils import Vector, Matrix

ROOT = "Forge Mech"
GUIDES = "Forge Guides (not exported)"
MARKERS = ("hip", "knee", "foot")


# ---------------------------------------------------------------- building blocks

def _collection(name, parent, role=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    if c.name not in [x.name for x in parent.children]:
        parent.children.link(c)
    if role:
        c["forge_role"] = role
    return c


def _mesh_object(name, bm, coll):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def _prism(outline, z0, z1):
    """An outline (list of (x, y)) extruded from z0 to z1."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((x, y, z1)) for x, y in outline]
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    return bm


def _blade(a, b, width, depth):
    """A flat bar from point a to point b: `width` across the side view, `depth` front to back."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = Vector((0, 1, 0))                      # thickness runs front to back
    across = d.cross(side).normalized()           # width lies in the leg's swing plane
    bm = bmesh.new()
    pts = []
    for p, w in ((a, width), (b, width * 0.7)):
        for s in (-1, 1):
            for t in (-1, 1):
                pts.append(bm.verts.new(p + across * (w / 2) * s + side * (depth / 2) * t))
    q = pts
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([q[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def _marker(name, role, at, coll, size):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "SPHERE"
    e.empty_display_size = size
    e.location = at
    e["forge"] = role
    coll.objects.link(e)
    return e


def _hex(r, cx=0.0, cy=0.0, stretch=1.0):
    return [(cx + r * math.cos(math.radians(30 + 60 * i)), cy + r * stretch * math.sin(math.radians(30 + 60 * i))) for i in range(6)]


# ---------------------------------------------------------------- the starter mech

def build_template(pairs=2):
    scene = bpy.context.scene
    if bpy.data.collections.get(ROOT) is not None:
        raise RuntimeError("There is already a Forge Mech in this file. Start a new file, or rename the old one.")
    root = _collection(ROOT, scene.collection)
    guides = _collection(GUIDES, scene.collection)

    body_z, hip_z = 1.2, 1.18
    body = _collection("Body", root, "body")
    head = _collection("Head", root, "head")
    _mesh_object("Body plate", _prism(_hex(0.9, stretch=0.82), body_z, body_z + 0.06), body)
    _mesh_object("Body deck", _prism(_hex(0.55, 0.0, 0.08, 0.8), body_z + 0.06, body_z + 0.12), body)
    hb = _prism([(-0.28, 0.0), (0.28, 0.0), (0.18, -0.34), (-0.18, -0.34)], 0.0, 0.05)
    bmesh.ops.rotate(hb, verts=hb.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-25), 3, "X"))
    bmesh.ops.translate(hb, verts=hb.verts, vec=(0, -0.62, body_z + 0.1))
    _mesh_object("Head", hb, head)

    span = 1.1                                     # front hip to back hip
    for i in range(pairs):
        n = i + 1
        y = 0.0 if pairs == 1 else -span / 2 + span * i / (pairs - 1)
        hip = Vector((0.55, y, hip_z))
        knee = Vector((1.05, y * 1.15, hip_z + 0.45))
        foot = Vector((1.45, y * 1.4, 0.0))
        leg = _collection(f"Leg {n}", root, f"leg{n}")
        thigh = _collection(f"Leg {n} Thigh", leg, f"leg{n}.thigh")
        shin = _collection(f"Leg {n} Shin", leg, f"leg{n}.shin")
        _mesh_object(f"Leg {n} thigh piece", _blade(hip, knee, 0.2, 0.06), thigh)
        _mesh_object(f"Leg {n} shin piece", _blade(knee, foot, 0.22, 0.06), shin)
        for m, at in zip(MARKERS, (hip, knee, foot)):
            _marker(f"Leg {n} {m.title()}", f"leg{n}.{m}", at, leg, 0.06)
        # live mirror preview of this leg on the other side
        inst = bpy.data.objects.new(f"Leg {n} mirror preview", None)
        inst.instance_type = "COLLECTION"
        inst.instance_collection = leg
        inst.scale = (-1, 1, 1)
        inst.hide_select = True
        guides.objects.link(inst)

    arrow = bpy.data.objects.new("Front (-Y)", None)
    arrow.empty_display_type = "SINGLE_ARROW"
    arrow.empty_display_size = 1.2
    arrow.rotation_euler = (math.radians(90), 0, 0)   # the arrow's +Z turned to -Y
    arrow.location = (0, 0, 0.02)
    arrow.hide_select = True
    guides.objects.link(arrow)

    scene.forge_name = scene.forge_name or "New Mech"
    return root


# ---------------------------------------------------------------- checking and export

def _legs(root):
    out = []
    for c in root.children:
        r = c.get("forge_role", "")
        if r.startswith("leg") and "." not in r:
            out.append(c)
    return sorted(out, key=lambda c: int(c["forge_role"][3:]) if c["forge_role"][3:].isdigit() else 99)


def _pieces(coll):
    return [o for o in coll.all_objects if o.type in {"MESH", "CURVE", "FONT", "SURFACE"}]


def check(context):
    """Problems as plain sentences; an empty list means ready to export."""
    root = bpy.data.collections.get(ROOT)
    if root is None:
        return ["There is no Forge Mech collection. Press New mech first."]
    context.view_layer.update()                    # so world positions are current
    msgs = []
    body = [c for c in root.children if c.get("forge_role") == "body"]
    if not body or not _pieces(body[0]):
        msgs.append("Body is empty: put at least one piece in the Body collection.")
    legs = _legs(root)
    if not legs:
        msgs.append("No legs: there should be collections Leg 1, Leg 2, ...")
    for leg in legs:
        r = leg["forge_role"]
        marks = {o.get("forge"): o for o in leg.objects if o.type == "EMPTY"}
        for m in MARKERS:
            if f"{r}.{m}" not in marks:
                msgs.append(f"{leg.name}: the {m.title()} marker is missing.")
        for part in ("thigh", "shin"):
            sub = [c for c in leg.children if c.get("forge_role") == f"{r}.{part}"]
            if not sub or not _pieces(sub[0]):
                msgs.append(f"{leg.name}: nothing in {leg.name} {part.title()}.")
        if all(f"{r}.{m}" in marks for m in MARKERS):
            h, k, f = (marks[f"{r}.{m}"].matrix_world.translation for m in MARKERS)
            if h.x < -1e-4 or f.x < -1e-4:
                msgs.append(f"{leg.name}: build legs on the +X side; the Bestiary mirrors them.")
            if (k - h).length < 1e-3 or (f - k).length < 1e-3:
                msgs.append(f"{leg.name}: two markers sit on top of each other.")
            if f.z > h.z:
                msgs.append(f"{leg.name}: the Foot is above the Hip.")
    return msgs


def export_glb(context, filepath):
    root = bpy.data.collections.get(ROOT)
    if root is None:
        raise RuntimeError("There is no Forge Mech collection. Press New mech first.")
    # label every exported object from the collection it sits in
    chosen = []
    def walk(coll, role):
        role = coll.get("forge_role", role)
        for o in coll.objects:
            if o.type == "EMPTY":
                if o.get("forge"):
                    chosen.append(o)
                continue
            if o.type in {"MESH", "CURVE", "FONT", "SURFACE"} and role and ("." in role or role in ("body", "head")):
                o["forge"] = role
                chosen.append(o)
        for c in coll.children:
            walk(c, role)
    walk(root, None)
    scene = context.scene
    scene["forge_mech"] = {"name": scene.forge_name, "dome": scene.forge_dome, "version": 1,
                           "appendage": scene.forge_appendage, "run": scene.forge_run}

    if context.view_layer.objects.active is not None and context.view_layer.objects.active.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in context.view_layer.objects:
        o.select_set(False)
    for o in chosen:
        if o.name in context.view_layer.objects:
            o.hide_set(False)
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=filepath, export_format="GLB", use_selection=True, export_extras=True,
        export_apply=True, export_yup=True, export_materials="NONE", export_animations=False,
    )
    return len(chosen)


# ---------------------------------------------------------------- UI

class FORGE_OT_new(bpy.types.Operator):
    bl_idname = "forge.new_mech"
    bl_label = "New mech"
    bl_description = "Build a labelled starter mech to replace piece by piece"
    bl_options = {"REGISTER", "UNDO"}
    pairs: bpy.props.IntProperty(name="Leg pairs", default=2, min=1, max=4)

    def execute(self, context):
        try:
            build_template(self.pairs)
        except RuntimeError as e:
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        self.report({"INFO"}, f"Starter mech with {self.pairs * 2} legs. Swap in your pieces, then Export GLB.")
        return {"FINISHED"}

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)


class FORGE_OT_check(bpy.types.Operator):
    bl_idname = "forge.check_mech"
    bl_label = "Check"
    bl_description = "List anything the Walker Bestiary would trip on"

    def execute(self, context):
        msgs = check(context)
        if not msgs:
            self.report({"INFO"}, "Ready to export.")
        for m in msgs:
            self.report({"WARNING"}, m)
        return {"FINISHED"}


class FORGE_OT_export(bpy.types.Operator):
    bl_idname = "forge.export_mech"
    bl_label = "Export GLB"
    bl_description = "Write a labelled .glb for the Walker Bestiary"
    filepath: bpy.props.StringProperty(subtype="FILE_PATH")
    filter_glob: bpy.props.StringProperty(default="*.glb", options={"HIDDEN"})

    def invoke(self, context, event):
        name = (context.scene.forge_name or "mech").strip().lower().replace(" ", "-")
        self.filepath = bpy.path.abspath("//") + name + ".glb" if bpy.data.filepath else name + ".glb"
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        msgs = check(context)
        if msgs:
            for m in msgs:
                self.report({"WARNING"}, m)
            self.report({"ERROR"}, "Fix the warnings above, then export again.")
            return {"CANCELLED"}
        path = bpy.path.ensure_ext(self.filepath, ".glb")
        n = export_glb(context, path)
        self.report({"INFO"}, f"Exported {n} labelled objects to {path}")
        return {"FINISHED"}


class FORGE_PT_panel(bpy.types.Panel):
    bl_label = "Forge Mech"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Forge"

    def draw(self, context):
        col = self.layout.column(align=True)
        col.operator("forge.new_mech", icon="ADD")
        col.separator()
        col.prop(context.scene, "forge_name", text="Name")
        col.prop(context.scene, "forge_dome", text="Dome", slider=True)
        col.prop(context.scene, "forge_appendage", text="Neck & tail")
        col.prop(context.scene, "forge_run", text="Runs")
        col.separator()
        col.operator("forge.check_mech", icon="CHECKMARK")
        col.operator("forge.export_mech", icon="EXPORT")
        box = self.layout.box()
        for line in ("Front is -Y. Build legs on +X only.",
                     "Thigh pieces swing at the Hip,",
                     "shin pieces at the Knee.",
                     "Leg 1 is the front pair."):
            box.label(text=line)


CLASSES = (FORGE_OT_new, FORGE_OT_check, FORGE_OT_export, FORGE_PT_panel)


def register():
    bpy.types.Scene.forge_name = bpy.props.StringProperty(name="Mech name", default="New Mech")
    bpy.types.Scene.forge_appendage = bpy.props.EnumProperty(
        name="Neck and tail", description="A neck and tail the Bestiary grows on the mech; Head pieces ride the neck",
        items=[("none", "None", "As built"), ("qilin", "Qilin", "Neck with a mane and antlers, tufted tail"),
               ("dragon", "Dragon", "Long neck, long waving tail"), ("scorpion", "Scorpion", "No neck, a tail curled over the back"),
               ("swan", "Swan", "Tall S-curved neck, short tail")], default="none")
    bpy.types.Scene.forge_run = bpy.props.EnumProperty(
        name="Runs", description="Whether the mech breaks into a run at speed",
        items=[("none", "Walks", "Steps only"), ("horse", "Trot and gallop", "Diagonal pairs, then a bounding gallop"),
               ("strider", "Pace and bound", "Same-side pairs, then front and back pairs")], default="none")
    bpy.types.Scene.forge_dome = bpy.props.FloatProperty(
        name="Dome", default=0.42, min=0.0, max=1.0,
        description="How far the Bestiary arches the body plates up in the middle (0 = flat)")
    for c in CLASSES:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
    del bpy.types.Scene.forge_name
    del bpy.types.Scene.forge_dome
    del bpy.types.Scene.forge_appendage
    del bpy.types.Scene.forge_run


if __name__ == "__main__":
    try:
        unregister()
    except Exception:
        pass
    register()
