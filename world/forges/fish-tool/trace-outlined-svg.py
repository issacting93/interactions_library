"""An outlined-fill drawing -> joined centre lines, by walking the skeleton as a graph, so lines meet at their junctions and thorns stay as short ticks.
  python3 trace-outlined-svg.py in.svg out.svg [spur]     spur: stubs shorter than this many line widths are dropped (default 1.6; 0.6 keeps thorns)"""
import sys, re, math, importlib.util, numpy as np, cv2
from skimage.morphology import skeletonize
from scipy import ndimage as ndi
spec=importlib.util.spec_from_file_location("c",__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "clean-outlined-svg.py"))
src=open(spec.origin).read().split("\nif __name__")[0]
ns={}; 
try: exec(compile(src.split("\ndef main")[0],"c","exec"),ns)
except Exception as e: print("partial load",e)
flatten,rdp=ns["flatten"],ns["rdp"]
S=24.0; inp,out=sys.argv[1],sys.argv[2]; SPUR=float(sys.argv[3]) if len(sys.argv)>3 else 1.6
s=open(inp).read(); vb=[float(x) for x in re.search(r'viewBox="([^"]*)"',s).group(1).split()]
W,H=int(vb[2]*S)+8,int(vb[3]*S)+8; img=np.zeros((H,W),np.uint8)
for d in re.findall(r' d="([^"]*)"',s):
    polys=[np.round(np.array(p)*S+4).astype(np.int32) for p in flatten(d)]; cv2.fillPoly(img,polys,255)      # even-odd over the path's subpaths
ink=img>0; dist=ndi.distance_transform_edt(ink); sk=skeletonize(ink); hw=np.median(dist[sk]); print("half width px",hw)
K=np.ones((3,3),int); deg=ndi.convolve(sk.astype(int),K,mode="constant")-1; deg[~sk]=0
nodepix=sk&(deg!=2); lab,n=ndi.label(nodepix,structure=K); cent=ndi.center_of_mass(nodepix,lab,range(1,n+1)) if n else []
nb=[(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
edges=[]; seen=np.zeros_like(sk)
ys,xs=np.nonzero(nodepix)
for y,x in zip(ys,xs):
    a=lab[y,x]
    for dy,dx in nb:
        yy,xx=y+dy,x+dx
        if not sk[yy,xx] or seen[yy,xx]: continue
        if nodepix[yy,xx]:
            if lab[yy,xx]!=a and a<lab[yy,xx]: edges.append([a,lab[yy,xx],[]])
            continue
        path=[(yy,xx)]; seen[yy,xx]=True; py,px=y,x; cy,cx=yy,xx; end=None
        while end is None:
            nxt=None
            for ey,ex in nb:
                ty,tx=cy+ey,cx+ex
                if (ty,tx)==(py,px) or not sk[ty,tx]: continue
                if nodepix[ty,tx]:
                    if lab[ty,tx]!=a or len(path)>2: end=lab[ty,tx]; 
                    continue
                if not seen[ty,tx]: nxt=(ty,tx)
            if end is not None: break
            if nxt is None: end=0; break
            py,px=cy,cx; cy,cx=nxt; seen[cy,cx]=True; path.append(nxt)
        edges.append([a,end,path])
# loops with no node
rest=sk&~nodepix&~seen; l2,n2=ndi.label(rest,structure=K); loops=[]
for i in range(1,n2+1):
    m=(l2==i).astype(np.uint8); c,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    pts=[(p[0][1],p[0][0]) for p in c[0]]; loops.append(pts[:len(pts)//2+1] if False else pts)
P=lambda a:(cent[a-1][0],cent[a-1][1])
def length(e): return len(e[2])
# prune spurs, merge through degree-2 nodes, until stable
changed=True
while changed:
    changed=False; d={}
    for e in edges:
        for a in (e[0],e[1]):
            if a: d[a]=d.get(a,0)+1
    keep=[]
    for e in edges:
        a,b=e[0],e[1]; enda=(d.get(a,0)==1); endb=(b==0 or d.get(b,0)==1)
        if (enda!=endb) and length(e)<SPUR*hw*2 and a!=b: changed=True; continue
        if a==b and length(e)<SPUR*hw*2: changed=True; continue
        keep.append(e)
    edges=keep
    d={}
    for i,e in enumerate(edges):
        for a in (e[0],e[1]):
            if a: d.setdefault(a,[]).append(i)
    for a,ii in d.items():
        if len(ii)==2 and ii[0]!=ii[1]:
            e1,e2=edges[ii[0]],edges[ii[1]]
            p1=e1[2] if e1[1]==a else e1[2][::-1]; o1=e1[0] if e1[1]==a else e1[1]
            if e1[0]==e1[1] or e2[0]==e2[1]: continue
            p2=e2[2] if e2[0]==a else e2[2][::-1]; o2=e2[1] if e2[0]==a else e2[0]
            edges[ii[0]]=[o1,o2,p1+[P(a)]+p2]; del edges[ii[1]]; changed=True; break
lines=[]
for a,b,path in edges:
    pts=([P(a)] if a else [])+path+([P(b)] if b else [])
    closed=(a==b and a!=0)
    lines.append((pts,closed))
for pts in loops: lines.append((pts,True))
def simp(pts,closed,tol=0.07*S):
    A=[(x,y) for y,x in pts]
    if closed:
        k=max(range(len(A)),key=lambda i:(A[i][0]-A[0][0])**2+(A[i][1]-A[0][1])**2); a=rdp(A[:k+1],tol); b=rdp(A[k:]+[A[0]],tol); return list(a)+list(b)[1:-1]
    return list(rdp(A,tol))
f=lambda v:("%.2f"%v).rstrip("0").rstrip(".")
body=[]; npts=0
for pts,closed in lines:
    q=simp(pts,closed)
    if len(q)<2: continue
    npts+=len(q); body.append('<path d="M%s%s"/>'%("L".join(f((x-4)/S)+" "+f((y-4)/S) for x,y in q),"Z" if closed else ""))
open(out,"w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" width="%s" height="%s">\n<g fill="none" stroke="#ECE8DE" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round">\n%s\n</g>\n</svg>\n'%(" ".join(f(v) for v in vb),f(vb[2]),f(vb[3]),"\n".join(b.replace("<path ",'<path vector-effect="non-scaling-stroke" ') for b in body)))
print(len(body),"lines,",sum(1 for l in lines if l[1]),"closed,",npts,"points; open ends",sum((1 if not a or True else 0) for a,b,p in edges if a!=b and (b==0)))
