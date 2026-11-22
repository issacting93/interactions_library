import json,re,math,subprocess,sys
P={p['id']:p for p in json.load(open('/home/claude/interactions_library/shared/data/creature-parts.json'))}
def geom(pid):
    ds=re.findall(r' d="([^"]+)"',P[pid]['svg']); n=[float(v) for d in ds for v in re.findall(r'-?\d*\.?\d+',d)]
    xs,ys=n[0::2],n[1::2]; return ds,(min(xs)+max(xs))/2,(min(ys)+max(ys))/2,max(xs)-min(xs),max(ys)-min(ys)
def part(pid,x,y,size,rot=0,flip=False,sx=1,sy=1,stroke='#ECE8DE',fill='#1D1D20',sw=1.4,op=1,anchor=None,fillop=1):
    """size: the part's longer side in px; anchor: (u,v) in -0.5..0.5 of its box to put at (x,y) instead of its centre"""
    ds,cx,cy,w,h=geom(pid); k=size/max(w,h)
    ax,ay=(cx,cy) if anchor is None else (cx+anchor[0]*w,cy+anchor[1]*h)
    t=f'translate({x:.1f} {y:.1f}) rotate({rot}) scale({(-k if flip else k)*sx:.4f} {k*sy:.4f}) translate({-ax:.2f} {-ay:.2f})'
    return f'<g transform="{t}" opacity="{op}"><path d="{" ".join(ds)}" fill="{fill}" fill-opacity="{fillop}" fill-rule="evenodd" stroke="{stroke}" stroke-width="{sw/(k*min(sx,sy)):.3f}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>'
def svg(items,W=900,H=620,bg='#161618',title=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{bg}"/>'+''.join(items)+'</svg>'
def render(name,s):
    open(name+'.svg','w').write(s); subprocess.run(['rsvg-convert','-o',name+'.png',name+'.svg'])
