import re, json, sys, copy
import xml.etree.ElementTree as ET
NS='http://www.w3.org/2000/svg'; ns='{%s}'%NS
ET.register_namespace('',NS); ET.register_namespace('xlink','http://www.w3.org/1999/xlink')
src, outdir, tol = sys.argv[1], sys.argv[2], float(sys.argv[3]); FMT=sys.argv[4] if len(sys.argv)>4 else '%.1f'
r=ET.parse(src).getroot()
defs=r.find(ns+'defs'); layer=r.find(ns+'g')
defmap={e.get('id'):e for e in defs}
num=re.compile(r'-?\d*\.?\d+(?:e-?\d+)?')
def rdp(pts,eps):
    if len(pts)<3: return pts
    (x1,y1),(x2,y2)=pts[0],pts[-1]; dx,dy=x2-x1,y2-y1; L=(dx*dx+dy*dy)**.5
    best,bi=0,0
    for i in range(1,len(pts)-1):
        px,py=pts[i]
        d=abs(dy*px-dx*py+x2*y1-y2*x1)/L if L else ((px-x1)**2+(py-y1)**2)**.5
        if d>best: best,bi=d,i
    if best>eps: return rdp(pts[:bi+1],eps)[:-1]+rdp(pts[bi:],eps)
    return [pts[0],pts[-1]]
def f(v): s=(FMT%v).rstrip('0').rstrip('.'); return '0' if s in('-0','') else s
def path(d,ox,oy,sc):
    toks=re.findall(r'[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?',d)
    out=[];i=0;run=[];cmd=None
    def flush():
        nonlocal run
        if run:
            pts=rdp(run,tol) if len(run)>2 else run
            out.append('L'+' '.join(f(x)+' '+f(y) for x,y in pts)); run=[]
    while i<len(toks):
        t=toks[i]
        if t in 'MLCZ': cmd=t;i+=1
        if cmd=='Z': flush(); out.append('Z'); cmd=None; continue
        n={'M':2,'L':2,'C':6}[cmd]
        vals=[float(x) for x in toks[i:i+n]]; i+=n
        pts=[((vals[k]-ox)*sc,(vals[k+1]-oy)*sc) for k in range(0,n,2)]
        if cmd=='L':
            if not run and out and out[-1].startswith('M'):
                # start run from M point
                pm=out.pop(); mx,my=[float(x) for x in pm[1:].split()]; out.append(pm); run=[(mx,my)]+pts
                continue
            if not run: run=[last]
            run+=pts
        else:
            flush()
            out.append(cmd+' '.join(f(x)+' '+f(y) for x,y in pts))
        last=pts[-1]
    flush()
    s=' '.join(out)
    # an L run started from M: remove duplicated first point
    s=re.sub(r'M(\S+ \S+) L\1 ',r'M\1 L',s)
    return s
def refs(e,acc):
    for el in e.iter():
        for k,v in el.attrib.items():
            m=re.match(r'url\(#([^)]+)\)',v)
            if m and m.group(1) not in acc and m.group(1) in defmap:
                acc.append(m.group(1)); refs(defmap[m.group(1)],acc)
    return acc
def xform(e,ox,oy,sc):
    e=copy.deepcopy(e)
    for el in e.iter():
        if el.get('d'): el.set('d',path(el.get('d'),ox,oy,sc))
        for a in ('x','y','width','height'):
            if el.tag in(ns+'mask',ns+'clipPath') : pass
        if el.tag==ns+'mask':
            for a in('x','y','width','height'): el.attrib.pop(a,None)
        if el.get('stroke-width'): el.set('stroke-width',f(float(el.get('stroke-width'))*sc))
    return e
kids=list(layer)
bgs=[k for k in kids if k.tag==ns+'path' and k.get('fill')=='#14171d']
texts=[k for k in kids if k.tag==ns+'text']
others=[k for k in kids if k not in bgs and k not in texts]
def bbox(e):
    v=[]
    for el in e.iter():
        if el.get('d'): v+= [float(x) for x in num.findall(el.get('d'))]
    xs,ys=v[0::2],v[1::2]
    return min(xs),min(ys),max(xs),max(ys)
cells=[]
for r_ in range(5):
    for c_ in range(6):
        cells.append([None,24+444*c_,24+490*r_,420,420,[]])
for t in texts:
    m=re.findall(r'[-\d.]+',t.get('transform')); tx,ty=float(m[4]),float(m[5])
    c_=round((tx-234)/444); r_=round((ty-473)/490)
    cells[r_*6+c_][0]=''.join(t.itertext()).strip()
for o in others+[b for b in bgs]:
    if o in bgs: continue
    try: x0,y0,x1,y1=bbox(o)
    except ValueError: continue
    cx,cy=(x0+x1)/2,(y0+y1)/2
    c_=min(5,max(0,int((cx-24+12)//444))); r_=min(4,max(0,int((cy-24+35)//490)))
    cells[r_*6+c_][5].append(o)
cells=[tuple(c) for c in cells]
manifest=[]
S=400
for name,x,y,w,h,body in cells:
    sc=S/max(w,h)
    root=ET.Element(ns+'svg',{'viewBox':f'0 0 {S} {S}'})
    ids=[]
    for b in body: refs(b,ids)
    if ids:
        d=ET.SubElement(root,ns+'defs')
        for k in ids: d.append(xform(defmap[k],x,y,sc))
    for b in body: root.append(xform(b,x,y,sc))
    txt=ET.tostring(root,encoding='unicode')
    txt=txt.replace('ns0:','').replace(':ns0','')
    title=(name or 'Untitled').strip()
    title=' '.join(w.capitalize() for w in title.split())
    slug=re.sub(r'[^a-z0-9]+','-',title.lower()).strip('-')
    open(f'{outdir}/{slug}.svg','w').write(txt)
    manifest.append({'name':title,'file':slug+'.svg','bytes':len(txt)})
json.dump(manifest,open(f'{outdir}/manifest.json','w'),indent=1)
for m in manifest: print(m['bytes'],m['name'])
print('total',sum(m['bytes'] for m in manifest),len(manifest))
