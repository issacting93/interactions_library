import json, re, io, math, xml.etree.ElementTree as ET, subprocess
from svgelements import SVG, Path as SPath, Matrix, Shape
from ext import leaves, NS
from clus import clusters
COL={'white':'#5fd38d','#ffffff':'#5fd38d','#fff':'#5fd38d','#ada6a6':'#5fd38d','#e8e4d8':'#5fd38d','#e8b04a':'#d6ffb0','black':'#14171d','#000':'#14171d','#000000':'#14171d','#141414':'#14171d'}
def col(c): return COL.get((c or '').lower(), c)
def bake(els, cx, cy, k, minsw=0.9, swmul=1.0, setsw=None):
    """elements -> list of baked <path> strings in part px, centred on (cx,cy) source units, scaled by k"""
    out=[]
    for e in els:
        a=dict(e.attrib)
        if 'mask' in a: continue
        s='<svg xmlns="http://www.w3.org/2000/svg">'+ET.tostring(e,encoding='unicode')+'</svg>'
        svg=SVG.parse(io.StringIO(s))
        for sh in svg.elements():
            if not isinstance(sh, Shape): continue
            p=SPath(sh)*Matrix(f'translate({-cx},{-cy})')*Matrix(f'scale({k})')
            p.reify()
            d=p.d()
            if not d: continue
            fill=a.get('fill','black' if e.tag.endswith(('path','rect','circle')) and 'stroke' not in a else 'none')
            stroke=a.get('stroke')
            attrs=f'd="{d}" fill="{col(fill) if fill!="none" else "none"}"'
            for o in ('fill-opacity','stroke-opacity','opacity'):
                if o in a: attrs+=f' {o}="{max(0.6, float(a[o]))}"'
            if (not stroke or stroke=='none') and fill not in ('none',None) and not setsw:
                # thin filled shapes get a hairline of their own colour so they read at our scale
                stroke=fill; a=dict(a); a['stroke-width']=str(0.7/k)
            if stroke and stroke!='none':
                sw=setsw if setsw else min(2.0, max(minsw, float(a.get('stroke-width','1'))*k*swmul))
                attrs+=f' stroke="{col(stroke)}" stroke-width="{sw:.2f}" stroke-linecap="{a.get("stroke-linecap","round")}" stroke-linejoin="round"'
                if 'stroke-dasharray' in a:
                    attrs+=' stroke-dasharray="'+' '.join(f'{float(v)*k:.2f}' for v in re.split(r'[ ,]+',a['stroke-dasharray'].strip()) if v)+'"'
            out.append(f'<path {attrs}/>')
    return out
def rnd_d(s):
    return re.sub(r'-?\d+\.\d+', lambda m: ('%.2f'%float(m.group(0))).rstrip('0').rstrip('.'), s)
parts=[]
def add(pid, name, frags, w, h, side='center', species='sheet-spine-dial'):
    svg='<g transform="translate(0 0)">'+rnd_d(''.join(frags))+'</g>'
    parts.append({'id':pid,'species':species,'side':side,'w':round(w,1),'h':round(h,1),'ox':200,'oy':200,'svg':svg,'defs':'','tw':round(w,1),'bw':round(w,1),'name':name})
# ---- spine dial / open ----
rootO,LO,CO=clusters('open.svg',1.0); rootD,LD,CD=clusters('dial.svg',1.0)
def fromclusters(L,C,ids,target,name,pid,side='center',minsw=0.9):
    idx=[i for c in ids for i in C[c]['idx']]
    bb=[min(C[c]['bb'][0] for c in ids),min(C[c]['bb'][1] for c in ids),max(C[c]['bb'][2] for c in ids),max(C[c]['bb'][3] for c in ids)]
    w,h=bb[2]-bb[0],bb[3]-bb[1]; k=target/max(w,h); cx,cy=(bb[0]+bb[2])/2,(bb[1]+bb[3])/2
    if side=='center': cx=cx  # symmetric parts keep their own centre
    add(pid,name,bake([L[i] for i in idx],cx,cy,k,minsw),w*k,h*k,side)
n=348
spec=[('O',[60],70,'Strike knob head'),('O',[76,77],72,'Vertebra bracket'),('O',[76],40,'Half bracket'),('O',[78],26,'Eye bead'),('O',[81],40,'Pin eye'),('O',[85],48,'Aim dial'),('O',[86],48,'Damp dial'),('O',[87],60,'Toggle'),('O',[75],24,'Chip'),('D',[52],92,'Spine stack')]
for src,ids,target,name in spec:
    L,C=(LO,CO) if src=='O' else (LD,CD)
    fromclusters(L,C,ids,target,name,f'P{n:03d}','left' if name=='Half bracket' else 'center'); n+=1
# dial ring: everything centred on the dial within r 80 except the numerals, labels and the spine/knob
rows=json.load(open('dial.svg.json'))
cxD,cyD=136.0,91.0
cx_r=[];sel=[]
for r in rows:
    x0,y0,x1,y1=r['bb']; w,h=x1-x0,y1-y0
    if w>200: continue
    mx,my=(x0+x1)/2,(y0+y1)/2; d=math.hypot(mx-cxD,my-cyD)
    if d>80: continue
    if r['op']==0.55 and h<2.6: continue
    if r['fill']=='#E8B04A' and w>4: continue      # the big 03
    if abs(mx-cxD)<16 and my>112: continue          # knob and spine
    if r['fill']=='#141414': continue
    sel.append(r['i'])
# estimate the ring centre from the selection
xs=[ (rows_i['bb'][0]+rows_i['bb'][2])/2 for rows_i in rows if rows_i['i'] in sel]
add(f'P{n:03d}','Dial ring',bake([LD[i] for i in sel],cxD,cyD,230/150,0.8),230,230); n+=1
# ---- xenoglyphs ----
g=ET.parse('glyph.svg').getroot()
gl=[e for e in g if e.tag==NS+'g']
names='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
for i,grp in enumerate(gl):
    tx,ty=map(float,re.findall(r'[-\d.]+',grp.get('transform')))
    inner=grp.find(NS+'g')
    els=list(inner)
    # glyph cell is 100x100 at scale .99; bake to a 40px box
    k=0.4*0.99
    frags=[]
    for e in els:
        e2=ET.Element(e.tag,dict(e.attrib)); 
        frags+=bake([e2],50,48,k,setsw=2.4)
    add(f'P{n:03d}',f'Glyph {names[i]}',frags,40,40,'center','sheet-xenoglyph'); n+=1
json.dump(parts,open('newparts.json','w'))
print(len(parts), sum(len(p['svg']) for p in parts))
# contact sheet
T=120;cols=8;cells=''
for k_,p in enumerate(parts):
    m=max(p['w'],p['h'])/2+4; X,Y=(k_%cols)*T,(k_//cols)*(T+14)
    cells+=f'<rect x="{X}" y="{Y}" width="{T-4}" height="{T-4}" fill="#14171d"/><svg x="{X}" y="{Y}" width="{T-4}" height="{T-4}" viewBox="{-m} {-m} {2*m} {2*m}">{p["svg"]}</svg><text x="{X+2}" y="{Y+T+8}" fill="#ccc" font-size="10" font-family="monospace">{p["id"]} {p["name"]} {p["w"]:.0f}x{p["h"]:.0f}</text>'
rowsN=(len(parts)+cols-1)//cols
open('new.sheet.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{cols*T}" height="{rowsN*(T+14)}"><rect width="100%" height="100%" fill="#000"/>{cells}</svg>')
subprocess.run(['rsvg-convert','new.sheet.svg','-o','new.sheet.png'])
