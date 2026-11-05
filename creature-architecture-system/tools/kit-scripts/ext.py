import re, json, copy, xml.etree.ElementTree as ET
from svgelements import SVG, Path as SPath, Matrix
NS='{http://www.w3.org/2000/svg}'
ET.register_namespace('', 'http://www.w3.org/2000/svg')
def bbox_of(el):
    s='<svg xmlns="http://www.w3.org/2000/svg">'+ET.tostring(el,encoding='unicode')+'</svg>'
    try:
        svg=SVG.parse(__import__('io').StringIO(s))
        bb=None
        for e in svg.elements():
            if hasattr(e,'bbox'):
                b=e.bbox()
                if b and all(v==v for v in b):
                    bb=b if bb is None else (min(bb[0],b[0]),min(bb[1],b[1]),max(bb[2],b[2]),max(bb[3],b[3]))
        return bb
    except Exception as ex: return None
def leaves(fn):
    root=ET.parse(fn).getroot(); out=[]
    def walk(node):
        for e in node:
            if e.tag in (NS+'defs',NS+'mask',NS+'clipPath'): continue
            if e.tag==NS+'g': walk(e); continue
            out.append(e)
    walk(root); return root,out
if __name__=='__main__':
    for fn in ['dial.svg','open.svg']:
        root,L=leaves(fn); rows=[]
        for i,e in enumerate(L):
            bb=bbox_of(e)
            if not bb: continue
            a=e.attrib
            op=float(a.get('fill-opacity',a.get('stroke-opacity',a.get('opacity','1'))))
            rows.append({'i':i,'bb':[round(v,2) for v in bb],'fill':a.get('fill'),'stroke':a.get('stroke'),'op':op,'mask':a.get('mask'),'tag':e.tag.replace(NS,'')})
        json.dump(rows,open(fn+'.json','w'))
        print(fn,len(L),len(rows))
