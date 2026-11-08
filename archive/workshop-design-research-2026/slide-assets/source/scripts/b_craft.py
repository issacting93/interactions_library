from dc import *
B = Board('Craft shifts', 1792, 828)
L, CW, GAP, CY = 64, 288, 56, 168
B.dimh(L, L + 5*CW + 4*GAP, 112, 'EVERY SHIFT LOWERED THE FLOOR')
icons = {
'parch': '<rect x="74" y="56" width="140" height="20" stroke-width="2"/><rect x="74" y="212" width="140" height="20" stroke-width="2"/><path d="M84 76 V212 M204 76 V212" stroke-width="2"/>' + ''.join(f'<path d="M104 {y} H{184 if y%32 else 160}"/>' for y in range(100, 200, 16)),
'paper': '<rect x="66" y="88" width="130" height="160" stroke="{{mute}}"/><rect x="80" y="70" width="130" height="160" stroke="{{mute}}"/><path d="M94 52 H198 L224 78 V212 H94 Z" fill="{{ground}}" stroke-width="2"/><path d="M198 52 V78 H224" stroke-width="2"/>' + ''.join(f'<path d="M112 {y} H{206 if y<180 else 168}"/>' for y in range(104, 200, 18)),
'keys': '<rect x="24" y="94" width="240" height="108" stroke-width="2"/>' + ''.join(f'<rect x="{38+c*22}" y="{108+r*22}" width="16" height="16"/>' for r in range(3) for c in range(10)) + '<rect x="82" y="174" width="124" height="16"/>',
'vector': '<rect x="54" y="62" width="180" height="164" stroke-dasharray="6 6" stroke="{{mute}}"/><rect x="48" y="56" width="12" height="12" fill="{{ground}}"/><rect x="228" y="56" width="12" height="12" fill="{{ground}}"/><rect x="48" y="220" width="12" height="12" fill="{{ground}}"/><rect x="228" y="220" width="12" height="12" fill="{{ground}}"/><path d="M78 196 C 110 90, 170 90, 210 150" stroke-width="2"/><path d="M78 196 L104 112 M210 150 L176 92" stroke="{{mute}}"/><rect x="72" y="190" width="12" height="12" fill="{{ink}}" stroke="none"/><rect x="204" y="144" width="12" height="12" fill="{{ink}}" stroke="none"/><path d="M196 196 L196 240 L206 230 L214 248 L222 244 L214 226 L228 226 Z" fill="{{ground}}" stroke-width="2"/>',
'laptop': '<rect x="62" y="70" width="164" height="112" stroke-width="2"/><rect x="74" y="82" width="140" height="88" stroke="{{mute}}"/><path d="M40 182 H248 L262 206 H26 Z" stroke-width="2"/><path d="M126 194 H162"/>' + ''.join(f'<path d="M86 {y} H{186 if y!=118 else 150}"/>' for y in (100, 118, 136)) + '<rect x="86" y="148" width="40" height="12" fill="{{amber}}" stroke="none"/>',
}
cols = [('01','parch','PARCHMENT','Hundreds of animals for one book'),
        ('02','paper','PAPER','No more skins'),
        ('03','keys','KEYBOARDS','No typewriter to master'),
        ('04','vector','VECTOR TOOLS','Not Photoshop'),
        ('05','laptop','BOOTCAMPS','Not art school')]
for i, (n, k, name, cap) in enumerate(cols):
    x = L + i*(CW+GAP)
    B.box(x, CY, CW, CW, sw=1, c='{{rule}}', inner=n, pad=12, align='flex-start')
    B.svg(x, CY, CW, CW, icons[k], name.title())
    B.text(x, CY + CW + 24, name, size=22, weight=400)
    B.text(x, CY + CW + 56, cap, size=18, c='{{mute}}', ls=0, w=CW, weight=300)
# the floor, stepping down across the five shifts
pts = []; y0 = 608
for i in range(5):
    x = L + i*(CW+GAP); y = y0 + i*28
    if i: pts.append(f'V{y}')
    pts.append(('M' if not i else 'H') + (f'{x - L} {y - y0}' if not i else f'{x - L}'))
    pts.append(f'H{x - L + CW + (GAP//2 if i<4 else 0)}')
# rebuild with relative coords
d = ''
for i in range(5):
    x = i*(CW+GAP); y = i*28
    d += (f'M0 0 ' if i == 0 else f'V{y} ') + f'H{x + CW + (GAP//2 if i < 4 else 0)} '
B.svg(L, y0, 1664, 120, f'<path d="{d}" stroke-width="2"/><rect x="{4*(CW+GAP)+CW-6}" y="{4*28-6}" width="12" height="12" fill="{{{{amber}}}}" stroke="none"/>', 'A floor line stepping down at each shift')
B.label(L, y0 + 4*28 + 24, 'FLOOR', size=16)
B.label(L + 1664 - 300, y0 + 4*28 + 24, 'FIG. 02 · NOT TO SCALE', size=16, w=300, align='right')
B.save('CraftShift.dc.html')
