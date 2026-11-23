"""Build the self-contained copy of the Walker Bestiary that is published as the "Walker Bestiary" artifact: the repo page
(world/forges/walker-bestiary/index.html) with its shared scripts laid flat beside it, the kit and mech slots as parts.json and
mech-slots.json, the specimens, and the Blender mock carried as a script (window.BLENDER_MECH_GLB; an artifact cannot fetch a file).

    python3 tools/publish/bestiary.py <out-dir>"""
import os, re, shutil, base64, sys
R = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")); O = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit(__doc__)
shutil.rmtree(O, ignore_errors=True); os.makedirs(O+'/specimens')
P=R+'/world/forges/walker-bestiary/index.html'; s=open(P).read()
flat={}
for m in re.finditer(r'<script src="((?:\.\./)+[^"]+)"></script>', s):
    src=m.group(1); name=os.path.basename(src); flat[src]=name
    shutil.copy(os.path.normpath(os.path.join(os.path.dirname(P), src)), O+'/'+name)
for src,name in flat.items(): s=s.replace(f'<script src="{src}"></script>', f'<script src="{name}"></script>')
for mod in ['walker.js','walker-brain.js']:
    s=s.replace(f'"../../../packages/motion/{mod}"', f'"./{mod}"'); shutil.copy(R+'/packages/motion/'+mod, O+'/'+mod)
s=s.replace('"../../../packages/kit/data/mechs/hand-mech.svg"','"specimens/hand-mech.svg"')
# the Blender mock carried as a script (no file fetch in an artifact): window.BLENDER_MECH_GLB
s=s.replace('<script src="ik.js"></script>','<script src="specimens/blender-mech.glb.js"></script>\n<script src="ik.js"></script>',1)
open(O+'/index.html','w').write(s)
for f,a,b in [('part-lib.js','"../../../packages/kit/data/creature-parts.json"','"parts.json"'),('mech-slots.js','"../../../packages/kit/data/mech-slots.json"','"mech-slots.json"')]:
    t=open(O+'/'+f).read(); assert a in t; open(O+'/'+f,'w').write(t.replace(a,b))
shutil.copy(R+'/packages/kit/data/creature-parts.json', O+'/parts.json'); shutil.copy(R+'/packages/kit/data/mech-slots.json', O+'/mech-slots.json')
for f in os.listdir(R+'/world/forges/walker-bestiary/specimens'): shutil.copy(R+'/world/forges/walker-bestiary/specimens/'+f, O+'/specimens/'+f)
shutil.copy(R+'/packages/kit/data/mechs/hand-mech.svg', O+'/specimens/hand-mech.svg')
open(O+'/specimens/blender-mech.glb.js','w').write('window.BLENDER_MECH_GLB = "'+base64.b64encode(open(R+'/packages/kit/data/mechs/blender-mech.glb','rb').read()).decode()+'";\n')
left=[l for l in s.splitlines() if '../../../' in l or '../../forge' in l]; print('left:', left[:5]); print(sorted(os.listdir(O)))
