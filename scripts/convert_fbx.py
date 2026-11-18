#!/usr/bin/env python3
"""Convert the source FBX to a web-ready GLB.

Run inside Blender:

    blender --background --factory-startup --python scripts/convert_fbx.py -- \
        --input ~/Downloads/model.fbx \
        --out public/models/study-01.glb \
        --texture assets/texture-2048.jpg

The source is a single photogrammetry mesh with a 4096 px TGA packed into the
FBX. We keep the scan bed, normalise the object to a 1 m bounding box and
reduce the texture to 2048 px JPEG. Nothing is retopologised or repaired.
"""

import argparse
import os
import sys
from math import isfinite

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--input", default=os.path.expanduser("~/Downloads/model.fbx"))
parser.add_argument("--out", default="public/models/study-01.glb")
parser.add_argument("--texture", default="assets/texture-2048.jpg")
parser.add_argument("--base-ratio", type=float, default=0.355,
                    help="height of the scan-bed top as a fraction of the mesh bounds")
args = parser.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=args.input)

obj = bpy.data.objects["model"]
mesh = obj.data
mesh.transform(obj.matrix_world)
obj.matrix_world = Matrix.Identity(4)

# The FBX stores a 4096 px TGA. A 2048 px JPEG is plenty for the web viewer and
# cuts the GLB from ~50 MB to under 4 MB.
img = bpy.data.images.get("Diffuse Texture")
if img:
    img.scale(2048, 2048)
    img.filepath_raw = os.path.abspath(args.texture)
    img.file_format = "JPEG"
    img.save(quality=88)

co = [v.co.copy() for v in mesh.vertices]
mn = Vector((min(v.x for v in co), min(v.y for v in co), min(v.z for v in co)))
mx = Vector((max(v.x for v in co), max(v.y for v in co), max(v.z for v in co)))
base_z = mn.z + (mx.z - mn.z) * args.base_ratio

# Centre the object (not the block) at the origin. The viewer clips the block
# at base_z when the scan bed is switched off.
above = [v for v in co if v.z > base_z]
amn = Vector((min(v.x for v in above), min(v.y for v in above), min(v.z for v in above)))
amx = Vector((max(v.x for v in above), max(v.y for v in above), max(v.z for v in above)))
center = (amn + amx) / 2
size = max(mx - mn)
if not isfinite(size) or size == 0:
    raise SystemExit("mesh has no usable bounds")

mesh.transform(Matrix.Translation(-center))
mesh.transform(Matrix.Scale(1.0 / size, 4))

mat = mesh.materials[0]
bsdf = mat.node_tree.nodes.get("Principled BSDF") if mat.use_nodes else None
if bsdf:
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0

os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(args.out),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_image_format="JPEG",
    export_jpeg_quality=88,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_yup=True,
)
print(f"base_z={base_z:.6f} center={tuple(round(v, 6) for v in center)}")
print(f"wrote {args.out} ({os.path.getsize(args.out)} bytes)")
