from dc import *
B = Board('Computers as social actors', 1792, 828)
CW, G, TOP, CH = 360, 64, 192, 300
XS = [80 + i*(CW+G) for i in range(4)]
B.dimh(XS[0] + CW//2, XS[3] + CW//2, 128, 'STUDIED FOR SIXTY YEARS')
ic = [
 # terminal with a typed exchange
 '<rect x="60" y="50" width="240" height="170" stroke-width="2"/><rect x="74" y="64" width="212" height="142" stroke="{{mute}}"/><path d="M60 220 L40 250 H320 L300 220" stroke-width="2"/>'
 '<path d="M90 90 H200 M90 112 H150"/><path d="M90 140 H230 M90 162 H180"/><rect x="186" y="156" width="10" height="14" fill="{{ink}}" stroke="none"/>',
 # monitor, a person, politeness flowing both ways
 '<rect x="40" y="60" width="160" height="130" stroke-width="2"/><rect x="54" y="74" width="132" height="102" stroke="{{mute}}"/><path d="M100 190 V214 M70 214 H170 M140 190 V214"/>'
 '<circle cx="290" cy="110" r="22" stroke-width="2"/><path d="M250 214 C 250 160, 330 160, 330 214" stroke-width="2"/>'
 '<path d="M206 104 H244 M206 126 H244"/><path d="M236 98 L244 104 L236 110 M214 120 L206 126 L214 132"/>',
 # a window with an assistant bubble in the corner
 '<rect x="40" y="40" width="280" height="200" stroke-width="2"/><path d="M40 64 H320"/><path d="M60 92 H220 M60 112 H260 M60 132 H190"/>'
 '<path d="M176 158 H300 V206 H232 L220 222 L216 206 H176 Z" fill="{{ground}}" stroke-width="1.5"/><path d="M192 176 H284 M192 190 H250"/>',
 # phone: an avatar that talks back
 '<rect x="110" y="20" width="140" height="240" stroke-width="2"/><path d="M164 34 H196"/><circle cx="180" cy="110" r="40" stroke-width="2"/><circle cx="166" cy="104" r="4" fill="{{ink}}" stroke="none"/><circle cx="194" cy="104" r="4" fill="{{ink}}" stroke="none"/><path d="M164 124 C 172 132, 188 132, 196 124"/>'
 + ''.join(f'<path d="M{132+i*12} {200-h} V{200+h}" stroke="{{{{amber}}}}" stroke-width="2"/>' for i, h in enumerate([4,10,18,8,22,12,6,14,4])),
]
rows = [('1966','ELIZA','People confide in a script.'),('1994','CASA','Social rules apply to machines.'),('1997','OFFICE ASSISTANT','Personality without capability.'),('2025','ANIMATED COMPANIONS','Personality as the product.')]
for i, x in enumerate(XS):
    B.box(x, TOP, CW, CH, sw=1, c='{{rule}}')
    B.svg(x, TOP + 10, CW, 280, ic[i], rows[i][1].title())
    B.text(x, TOP + CH + 32, rows[i][0], size=48, weight=200, ls=0, lh=56)
    B.text(x, TOP + CH + 100, rows[i][1], size=16, weight=400)
    B.text(x, TOP + CH + 128, rows[i][2], size=20, ls=0, c='{{mute}}', w=CW)
B.label(1728 - 240, 744, 'FIG. 08', w=240, align='right')
B.save('CasaTimeline.dc.html')
