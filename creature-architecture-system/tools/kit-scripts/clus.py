import json, xml.etree.ElementTree as ET, subprocess, sys
from ext import leaves, NS
def clusters(fn, gap=1.0):
    root,L=leaves(fn); rows=json.load(open(fn+'.json'))
    keep=[]
    for r in rows:
        x0,y0,x1,y1=r['bb']; w,h=x1-x0,y1-y0
        if w>200: continue                      # background
        if r['op']<=0.3: continue               # faint duplicate strokes
        if r['op']==0.55 and h<2.6: continue    # small labels
        if r['fill']=='#141414': continue
        keep.append(r)
    # union-find on expanded bbox overlap
    par=list(range(len(keep)))
    def f(a):
        while par[a]!=a: par[a]=par[par[a]]; a=par[a]
        return a
    for i in range(len(keep)):
        a=keep[i]['bb']
        for j in range(i+1,len(keep)):
            b=keep[j]['bb']
            if a[0]-gap<=b[2] and b[0]-gap<=a[2] and a[1]-gap<=b[3] and b[1]-gap<=a[3]: par[f(i)]=f(j)
    C={}
    for i,r in enumerate(keep): C.setdefault(f(i),[]).append(r)
    out=[]
    for c in C.values():
        bb=[min(r['bb'][0] for r in c),min(r['bb'][1] for r in c),max(r['bb'][2] for r in c),max(r['bb'][3] for r in c)]
        out.append({'bb':bb,'idx':[r['i'] for r in c]})
    out.sort(key=lambda c:(c['bb'][1],c['bb'][0]))
    return root,L,out
if __name__=='__main__':
    fn=sys.argv[1]; root,L,C=clusters(fn, float(sys.argv[2]) if len(sys.argv)>2 else 1.0)
    T=110; cols=10; cells=''
    for k,c in enumerate(C):
        x0,y0,x1,y1=c['bb']; m=max(x1-x0,y1-y0)/2+1; cx,cy=(x0+x1)/2,(y0+y1)/2
        body=''.join(ET.tostring(L[i],encoding='unicode').replace(' xmlns="http://www.w3.org/2000/svg"','') for i in c['idx'])
        X,Y=(k%cols)*T,(k//cols)*(T+14)
        cells+=f'<rect x="{X}" y="{Y}" width="{T-4}" height="{T-4}" fill="#000"/><svg x="{X}" y="{Y}" width="{T-4}" height="{T-4}" viewBox="{cx-m} {cy-m} {2*m} {2*m}">{body}</svg><text x="{X+2}" y="{Y+T+8}" fill="#ccc" font-size="10" font-family="monospace">{k} {x1-x0:.0f}x{y1-y0:.0f} n{len(c["idx"])}</text>'
    rows=(len(C)+cols-1)//cols
    defs=''.join(ET.tostring(e,encoding='unicode') for e in root if e.tag in (NS+'defs',NS+'mask'))
    open(fn+'.sheet.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{cols*T}" height="{rows*(T+14)}"><defs>{defs}</defs><rect width="100%" height="100%" fill="#222"/>{cells}</svg>')
    subprocess.run(['rsvg-convert',fn+'.sheet.svg','-o',fn+'.sheet.png'])
    json.dump(C,open(fn+'.clusters.json','w'))
    print(len(C))
