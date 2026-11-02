"""Tiny isometric line-drawing kit: painter's order + ground fills = hidden-line removal."""
import math
C, S = math.cos(math.radians(30)), math.sin(math.radians(30))
class Iso:
    def __init__(self, s=1.0, ox=0, oy=0): self.s, self.ox, self.oy = s, ox, oy
    def p(self, x, y, z):
        return (self.ox + (x - y) * C * self.s, self.oy + ((x + y) * S - z) * self.s)
    def poly(self, pts, fill='{{ground}}', stroke='{{ink}}', sw=1, dash=None):
        q = [self.p(*a) for a in pts]
        d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in q) + ' Z'
        ds = f' stroke-dasharray="{dash}"' if dash else ''
        return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{ds} stroke-linejoin="round"/>', q
    def seg(self, a, b, stroke='{{ink}}', sw=1, dash=None):
        (x1, y1), (x2, y2) = self.p(*a), self.p(*b)
        ds = f' stroke-dasharray="{dash}"' if dash else ''
        return f'<path d="M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}" stroke="{stroke}" stroke-width="{sw}"{ds}/>', [(x1, y1), (x2, y2)]
    def box(self, x0, y0, z0, x1, y1, z1, top='{{ground}}', side='{{ground}}', stroke='{{ink}}', sw=1):
        out, pts = [], []
        for f, fill in (([(x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1)], side),
                        ([(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)], side),
                        ([(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)], top)):
            s_, q = self.poly(f, fill, stroke, sw); out.append(s_); pts += q
        return ''.join(out), pts
    def wire(self, x0, y0, z0, x1, y1, z1, stroke='{{mute}}', sw=1, dash='4 4'):
        V = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        out, pts = [], []
        for i, a in enumerate(V):
            for b in V[i+1:]:
                if sum(u != v for u, v in zip(a, b)) == 1:
                    s_, q = self.seg(a, b, stroke, sw, dash); out.append(s_); pts += q
        return ''.join(out), pts
def bbox(pts, pad=4):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad
