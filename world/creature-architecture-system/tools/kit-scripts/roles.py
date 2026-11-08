import json
P=json.load(open('forge/parts.json'))
def roles(p):
    r=[];w,h,tw,bw=p['w'],p['h'],p['tw'],p['bw']
    if p['side']!='center': return ['side'] if max(w,h)>18 else []
    if w>140 and abs(w-h)<0.25*w: r.append('halo')
    if h>=1.4*w and w<120: r.append('shaft')
    if w>=1.2*h and h<90: r.append('ring')
    if tw<0.45*max(bw,1) and h>=0.8*w: r.append('crown')
    if bw>=tw*1.1 and w>=0.6*h and w<200: r.append('base')
    return r
