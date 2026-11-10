from dc import *
from iso import Iso, bbox
B = Board('Toolbox', 1792, 828, dark=True)
W, D, H = 480, 300, 64          # box, in model units
ZT = H + 96                      # where the tools float
LID = 150
comps = {  # name: (x0, x1, y0, y1), filled?
 'pencil': (12, 232, 12, 104, True), 'ruler': (232, 372, 12, 104, True), 'pen tool': (372, 468, 12, 104, True),
 'swatches': (12, 152, 104, 196, True), 'stickies': (152, 292, 104, 196, True), 'simulation': (292, 468, 104, 196, False),
 'statistics': (12, 172, 196, 288, False), 'evals': (172, 312, 196, 288, False), 'social science': (312, 468, 196, 288, False)}
def build(I):
    parts = []   # (svg_body, pts, kind, name)
    # open lid, standing at the back edge
    s1, p1 = I.box(0, -14, H, W, 0, H + LID)
    s2, _ = I.poly([(40, 0, H + 40), (W - 40, 0, H + 40), (W - 40, 0, H + LID - 30), (40, 0, H + LID - 30)], fill='none', stroke='{{mute}}', dash='3 5')
    s3, _ = I.box(W/2 - 50, -14, H + LID, W/2 + 50, -4, H + LID + 22)   # handle
    parts.append((s1 + s2 + s3, p1, 'lid', 'lid'))
    # base body + compartments
    s, p = I.box(0, 0, 0, W, D, H)
    for k, (x0, x1, y0, y1, f) in comps.items():
        d = 40
        s += I.poly([(x0, y0, H), (x1, y0, H), (x1, y1, H), (x0, y1, H)])[0]
        s += I.poly([(x0, y0, H), (x1, y0, H), (x1, y0, H - d), (x0, y0, H - d)], fill='{{panel}}')[0]
        s += I.poly([(x0, y0, H), (x0, y1, H), (x0, y1, H - d), (x0, y0, H - d)], fill='{{panel}}')[0]
    s += I.seg((0, D, 12), (W, D, 12))[0]                                  # seam
    s += I.box(W/2 - 24, D, H - 30, W/2 + 24, D + 6, H - 6)[0]             # latch
    parts.append((s, p, 'base', 'base'))
    # tools, floating over their slots
    def c(k): x0, x1, y0, y1, _ = comps[k]; return (x0 + x1) / 2, (y0 + y1) / 2
    tools = []
    cx, cy = c('pencil'); z = ZT
    s, p = I.box(cx - 90, cy - 9, z, cx + 60, cy + 9, z + 18)
    s += I.seg((cx - 70, cy - 9, z + 18), (cx - 70, cy + 9, z + 18))[0] + I.seg((cx - 62, cy - 9, z + 18), (cx - 62, cy + 9, z + 18))[0]
    ap = (cx + 100, cy, z + 9)
    s += I.poly([(cx + 60, cy - 9, z + 18), (cx + 60, cy + 9, z + 18), ap])[0] + I.poly([(cx + 60, cy + 9, z + 18), (cx + 60, cy + 9, z), ap])[0]
    s += I.poly([(cx + 88, cy - 2, z + 12), (cx + 88, cy + 2, z + 12), ap], fill='{{ink}}')[0]
    tools.append((s, p + [I.p(*ap)], 'pencil', (cx, cy)))
    cx, cy = c('ruler')
    s, p = I.box(cx - 60, cy - 22, z, cx + 60, cy + 22, z + 5)
    for i in range(1, 20):
        L = 14 if i % 5 == 0 else 7
        s += I.seg((cx - 60 + i * 6, cy - 22, z + 5), (cx - 60 + i * 6, cy - 22 + L, z + 5))[0]
    tools.append((s, p, 'ruler', (cx, cy)))
    cx, cy = c('pen tool')
    s, p = I.box(cx - 40, cy - 36, z, cx + 40, cy + 36, z + 4)
    a, b, c1, c2 = (cx - 28, cy + 24, z + 4), (cx + 28, cy - 22, z + 4), (cx - 20, cy - 30, z + 4), (cx + 4, cy - 30, z + 4)
    (ax, ay), (bx, by), (c1x, c1y), (c2x, c2y) = I.p(*a), I.p(*b), I.p(*c1), I.p(*c2)
    s += f'<path d="M{ax:.1f} {ay:.1f} C{c1x:.1f} {c1y:.1f} {c2x:.1f} {c2y:.1f} {bx:.1f} {by:.1f}" stroke="{{{{ink}}}}" stroke-width="1.5" fill="none"/>'
    s += f'<path d="M{ax:.1f} {ay:.1f} L{c1x:.1f} {c1y:.1f} M{bx:.1f} {by:.1f} L{c2x:.1f} {c2y:.1f}" stroke="{{{{mute}}}}" stroke-width="1"/>'
    for x_, y_ in ((ax, ay), (bx, by)): s += f'<rect x="{x_-3:.1f}" y="{y_-3:.1f}" width="6" height="6" fill="{{{{ink}}}}"/>'
    for x_, y_ in ((c1x, c1y), (c2x, c2y)): s += f'<circle cx="{x_:.1f}" cy="{y_:.1f}" r="3" fill="{{{{ground}}}}" stroke="{{{{ink}}}}"/>'
    tools.append((s, p, 'pen tool', (cx, cy)))
    cx, cy = c('swatches'); s, p = '', []
    for i in range(4):
        x0 = cx - 56 + i * 30
        s_, p_ = I.box(x0, cy - 11, z, x0 + 22, cy + 11, z + 22, top='{{amber}}' if i == 2 else '{{ground}}')
        s += s_; p += p_
    tools.append((s, p, 'swatches', (cx, cy)))
    cx, cy = c('stickies'); s, p = '', []
    for i in range(3):
        s_, p_ = I.box(cx - 34 + i * 6, cy - 34 + i * 6, z + i * 10, cx + 26 + i * 6, cy + 26 + i * 6, z + i * 10 + 3)
        s += s_; p += p_
    tools.append((s, p, 'stickies', (cx, cy)))
    for k in ('simulation', 'statistics', 'evals', 'social science'):
        x0, x1, y0, y1, _ = comps[k]; cx, cy = c(k)
        s, p = I.wire(x0 + 16, y0 + 16, z, x1 - 16, y1 - 16, z + 30)
        s += I.seg((cx - 10, cy, z + 30), (cx + 10, cy, z + 30), '{{mute}}')[0] + I.seg((cx, cy - 10, z + 30), (cx, cy + 10, z + 30), '{{mute}}')[0]
        tools.append((s, p, k, (cx, cy)))
    tools.sort(key=lambda t: t[3][0] + t[3][1])
    return parts, tools
# fit: measure at scale 1, then scale into the drawing zone
I = Iso(1)
parts, tools = build(I)
allp = sum((t[1] for t in parts + tools), [])
x0, y0, x1, y1 = bbox(allp, 0)
ZX, ZY, ZW, ZH = 96, 96, 1000, 640
s = min(ZW / (x1 - x0), ZH / (y1 - y0))
I = Iso(s, ZX - x0 * s + (ZW - (x1 - x0) * s) / 2, ZY - y0 * s + (ZH - (y1 - y0) * s) / 2)
parts, tools = build(I)
print('scale', round(s, 3))
def place(body, pts, label):
    bx0, by0, bx1, by1 = [round(v) for v in bbox(pts, 6)]
    w, h = bx1 - bx0, by1 - by0
    B.svg(bx0, by0, w, h, f'<g transform="translate({-bx0} {-by0})" stroke-linecap="round">{body}</g>', label)
    return bx0, by0, bx1, by1
for body, pts, k, _ in parts: place(body, pts, k)
# assembly lines: tool → its slot (dashed, arrow down)
zH = H
for body, pts, k, (cx, cy) in tools:
    tx, ty = I.p(cx, cy, ZT); fx, fy = I.p(cx, cy, zH - 40)
    B.line(round(tx), round(ty), round(tx), round(fy) - 1, c='{{mute}}', sw=1, head=True, dash='4 4')
boxes = {}
for body, pts, k, _ in tools:
    boxes[k] = place(body, pts, k)
# callouts: numbered badges on short vertical leaders
order = ['pencil','ruler','pen tool','swatches','stickies','simulation','statistics','evals','social science']
badges = []
for n, k in enumerate(order, 1):
    cx, cy = [t[3] for t in tools if t[2] == k][0]
    bx0, by0, bx1, by1 = boxes[k]
    tx, _ = I.p(cx, cy, ZT)
    x, ytop = round(tx), by0
    badges.append([n, k, x, ytop - 30, ytop])
# nudge badges apart
for _ in range(50):
    for i in range(len(badges)):
        for j in range(len(badges)):
            if i != j and abs(badges[i][2] - badges[j][2]) < 30 and abs(badges[i][3] - badges[j][3]) < 30:
                if badges[i][3] <= badges[j][3]: badges[i][3] -= 4
for n, k, x, y, ytop in badges:
    missing = not comps[k][4]
    c = '{{mute}}' if missing else '{{ink}}'
    B.line(x, y + 12, x, ytop + 4, c=c, sw=1)
    bd = f'1px dashed {c}' if missing else f'1px solid {c}'
    B.raw(f'<div style="position: absolute; left: {x - 12}px; top: {y - 12}px; width: 24px; height: 24px; box-sizing: border-box; border-radius: 12px; border: {bd}; background: {{{{ground}}}}; display: flex; align-items: center; justify-content: center; font-size: 12px; line-height: 12px; color: {c}">{n}</div>')
print(badges)
# right column: index, name, spec grid
RX = 1296
B.text(RX, 56, '01', size=200, weight=200, ls=-8, lh=200, w=432, align='right')
B.text(RX, 296, 'toolbox', size=40, weight=300, ls=-0.5, lh=44)
B.text(RX, 344, 'design kit · exploded view', size=16, c='{{mute}}', ls=0.5)
grid = [('overview', 'designers need more in the toolbox.'),
        ('in the box', '1 pencil · 2 ruler · 3 pen tool · 4 swatches · 5 stickies'),
        ('missing', '6 simulation · 7 statistics · 8 evals · 9 social science'),
        ('scale', 'tools not to scale')]
for i, (h, t) in enumerate(grid):
    y = 448 + i * 76
    B.line(RX, y, RX + 432, y, c='{{rule}}', sw=1)
    B.text(RX, y + 12, f'● {h}', size=14, ls=0.5, lh=18)
    B.text(RX, y + 34, t, size=16, ls=0, lh=22, c='{{mute}}', w=432)
B.save('Main.dc.html')
