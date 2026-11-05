import json,re,copy,sys
import xml.etree.ElementTree as ET
NSU='http://www.w3.org/2000/svg'; ns='{%s}'%NSU
ET.register_namespace('',NSU)
lib=json.load(open('forge/library.json'))
num=re.compile(r'-?\d*\.?\d+')
def bb(vals):
    xs,ys=vals[0::2],vals[1::2]; return [min(xs),min(ys),max(xs),max(ys)]
def inside(a,b,m=0.5): return a[0]>=b[0]-m and a[1]>=b[1]-m and a[2]<=b[2]+m and a[3]<=b[3]+m
def area(b): return (b[2]-b[0])*(b[3]-b[1])
STYLE=('fill','stroke','stroke-width','stroke-linejoin','stroke-linecap','opacity','fill-opacity','stroke-opacity','fill-rule')
parts=[]
MIN=int(sys.argv[1]) if len(sys.argv)>1 else 10
for s in lib:
    r=ET.fromstring(s['svg'])
    defs=r.find(ns+'defs')
    defmap={e.get('id'):e for e in (defs if defs is not None else [])}
    leaves=[]
    for body in r:
        if body.tag==ns+'defs': continue
        inh={k:v for k,v in body.attrib.items() if k in STYLE}
        if body.tag==ns+'g' and not body.get('mask') and not body.get('clip-path'):
            for l in body: leaves.append((l,inh))
        else: leaves.append((body,{}))
    k=0
    for l,inh in leaves:
        if l.tag==ns+'path' and not l.get('mask') and not l.get('clip-path'):
            subs=[('M'+x).strip() for x in l.get('d').split('M') if x.strip()]
            boxes=[bb([float(v) for v in num.findall(x)]) for x in subs]
            order=sorted(range(len(subs)),key=lambda i:-area(boxes[i]))
            groups=[];smalls=[]
            for i in order:
                host=next((g for g in groups if inside(boxes[i],g['box'])),None)
                if host: host['d'].append(subs[i])
                elif max(boxes[i][2]-boxes[i][0],boxes[i][3]-boxes[i][1])<MIN: smalls.append(i)
                else: groups.append({'box':boxes[i],'d':[subs[i]]})
            def gap(a,b): return max(b[0]-a[2],a[0]-b[2],0)+max(b[1]-a[3],a[1]-b[3],0)
            for i in smalls:
                cand=[g for g in groups if gap(boxes[i],g['box'])<14]
                if cand:
                    g=min(cand,key=lambda g:gap(boxes[i],g['box'])); g['d'].append(subs[i])
                    b=g['box']; c=boxes[i]; g['box']=[min(b[0],c[0]),min(b[1],c[1]),max(b[2],c[2]),max(b[3],c[3])]
                else: groups.append({'box':boxes[i],'d':[subs[i]]})
            attrs={**inh,**{a:v for a,v in l.attrib.items() if a in STYLE}}
            for g in groups:
                frag=ET.Element(ns+'path',{'d':' '.join(g['d']),**attrs})
                parts.append((s,frag,g['box'],[]))
        else:
            v=[]
            for el in l.iter():
                if el.get('d'): v+=[float(x) for x in num.findall(el.get('d'))]
            if not v: continue
            refs=[]
            for el in l.iter():
                for a in el.attrib.values():
                    m=re.match(r'url\(#([^)]+)\)',a)
                    if m and m.group(1) in defmap: refs.append(m.group(1))
            frag=copy.deepcopy(l)
            for a,val in inh.items(): frag.attrib.setdefault(a,val)
            parts.append((s,frag,bb(v),[ET.tostring(defmap[x],encoding='unicode') for x in dict.fromkeys(refs)]))
out=[];cnt={'left':0,'center':0,'right':0,'tiny':0}
for i,(s,frag,b,refs) in enumerate(parts):
    w,h=b[2]-b[0],b[3]-b[1]
    if max(w,h)<MIN: cnt['tiny']+=1; continue
    side='center' if b[0]<197 and b[2]>203 else 'left' if b[2]<=203 else 'right'
    cnt[side]+=1
    if side=='right': continue
    cx=(b[0]+b[2])/2 if side!='center' else 200; cy=(b[1]+b[3])/2
    fx=f'<g transform="translate({-cx:.1f} {-cy:.1f})">'+ET.tostring(frag,encoding='unicode').replace(' xmlns="http://www.w3.org/2000/svg"','')+'</g>'
    defs=''.join(x.replace(' xmlns="http://www.w3.org/2000/svg"','') for x in refs)
    pts=[]
    for el in frag.iter():
        if el.get('d'):
            v=[float(x) for x in num.findall(el.get('d'))]; pts+=list(zip(v[0::2],v[1::2]))
    band=max(h*0.15,2)
    top=[abs(x-cx) for x,y in pts if y<=b[1]+band]; bot=[abs(x-cx) for x,y in pts if y>=b[3]-band]
    tw=round(2*max(top),1) if top else round(w,1); bw=round(2*max(bot),1) if bot else round(w,1)
    out.append({'species':s['id'],'side':side,'tw':tw,'bw':bw,'w':round(w,1),'h':round(h,1),'ox':round(cx,1),'oy':round(cy,1),'svg':fx,'defs':defs})
# dedupe identical fragments and rename masks per part
seen=set();final=[]
for p in out:
    key=p['svg']
    if key in seen: continue
    seen.add(key); final.append(p)
for i,p in enumerate(final):
    p['id']=f'P{i+1:03d}'
    if p['defs']:
        for mid in set(re.findall(r'id="([^"]+)"',p['defs'])):
            p['defs']=p['defs'].replace(f'id="{mid}"',f'id="{p["id"]}-{mid}"').replace(f'#{mid})',f'#{p["id"]}-{mid})')
            p['svg']=p['svg'].replace(f'#{mid})',f'#{p["id"]}-{mid})')
print(cnt,len(final),sum(len(p['svg'])+len(p['defs']) for p in final))
from collections import Counter
print(Counter(p['species'] for p in final).most_common())
json.dump(final,open('forge/parts.json','w'),separators=(',',':'))
