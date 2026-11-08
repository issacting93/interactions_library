from dc import *
B = Board('What we already know', 1792, 828)
CW, G, TOP, CH = 388, 37, 112, 320
XS = [64 + i*(CW+G) for i in range(4)]
person = lambda x, y, s='{{ink}}': f'<circle cx="{x}" cy="{y}" r="16" stroke="{s}" stroke-width="2"/><path d="M{x-30} {y+64} C {x-30} {y+24}, {x+30} {y+24}, {x+30} {y+64}" stroke="{s}" stroke-width="2"/>'
ic = [
 # isolated: a group, one apart, talking to a screen
 person(60, 90, '{{mute}}') + person(120, 90, '{{mute}}') + person(90, 150, '{{mute}}') + person(250, 130)
 + '<rect x="300" y="110" width="50" height="84" stroke-width="2"/><path d="M276 120 H296 M276 132 H292" />',
 # depending: a person tethered to a phone
 person(110, 120) + '<rect x="250" y="90" width="64" height="110" stroke-width="2"/><path d="M146 150 C 180 150, 200 140, 250 140" stroke-width="2"/>'
 + ''.join(f'<rect x="{186+i*18}" y="{138}" width="14" height="10" fill="{{{{ground}}}}"/>' for i in range(3)),
 # relief now, unclear later
 '<path d="M40 220 H348 M40 60 V220" stroke-width="1.5"/><path d="M40 200 C 90 200, 110 110, 170 110" stroke-width="2"/><path d="M170 110 C 230 110, 260 150, 330 130" stroke="{{mute}}" stroke-dasharray="6 8" stroke-width="2"/>'
 '<path d="M170 60 V220" stroke="{{mute}}" stroke-width="1"/>',
 # manipulate: a marionette control bar and strings
 '<path d="M110 40 H290 M200 20 V80 M150 64 H250" stroke="{{amber}}" stroke-width="3"/>' + ''.join(f'<path d="M{x} {40 if x in (110,290) else 64} V{y}" stroke="{{{{amber}}}}" stroke-width="1"/>' for x, y in ((110, 170), (290, 170), (150, 210), (250, 210)))
 + person(200, 150) + '<path d="M170 214 L150 210 M230 214 L250 210 M110 170 L176 180 M290 170 L224 180"/>',
]
rows = [('01', 'People who are isolated lean on chatbots more.'), ('02', 'They’re more at risk of depending on them.'),
        ('03', 'Relief in the short term. Long-term benefit? Unclear.'), ('04', 'And it can manipulate.')]
for i, x in enumerate(XS):
    B.box(x, TOP, CW, CH, sw=1, c='{{rule}}', inner=rows[i][0], align='flex-start', pad=12)
    B.svg(x, TOP + 40, CW, 260, ic[i], rows[i][1])
    B.text(x, TOP + CH + 24, rows[i][1], size=24, ls=0, lh=32, w=CW - 24)
B.label(XS[2] + 28, TOP + 40 + 228, 'NOW', size=13)
B.label(XS[2] + 186, TOP + 40 + 228, 'LATER?', size=13)
B.text(64, 640, 'Not a clear picture. But not a great one.', size=32, ls=0)
B.label(64, 712, 'FANG ET AL., 2025 · PHANG ET AL., 2025 · DE FREITAS ET AL., 2025', size=14, w=1200)
B.label(1728 - 240, 712, 'FIG. 10', w=240, align='right', size=14)
B.save('KnowNow.dc.html')
