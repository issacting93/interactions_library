from dc import *
B = Board('Uncanny valley', 1792, 828)
X0, Y0, W, H, BL = 160, 128, 1200, 520, 340
curve = 'M0 330 C 280 300, 560 130, 740 100 C 860 80, 900 470, 960 470 C 1030 470, 1090 60, 1200 20'
pts = {'t': (120, 318), 'c': (740, 100), 'v': (960, 470), 'p': (1200, 20)}
body = (f'<path d="M0 0 V{H} H{W}" stroke-width="1.5"/>'
        f'<path d="M0 {BL} H{W}" stroke="{{{{mute}}}}" stroke-dasharray="4 8" stroke-width="1"/>'
        f'<path d="M{W-12} {H-6} L{W} {H} L{W-12} {H+6} M-6 12 L0 0 L6 12"/>'
        f'<path d="{curve}" stroke-width="2"/>'
        f'<path d="M900 {BL} V{H}" stroke="{{{{amber}}}}" stroke-dasharray="6 6"/><path d="M1040 {BL} V{H}" stroke="{{{{amber}}}}" stroke-dasharray="6 6"/>')
for k, (x, y) in pts.items():
    fill = '{{amber}}' if k == 'v' else '{{ink}}'
    body += f'<rect x="{x-7}" y="{y-7}" width="14" height="14" fill="{fill}" stroke="none"/>'
B.svg(X0, Y0, W, H, body, 'A schematic curve: affinity rises with human likeness, drops sharply just before fully human, then recovers')
lab = lambda k, s, dx, dy, w=240, c='{{ink}}', a='left': B.label(X0 + pts[k][0] + dx, Y0 + pts[k][1] + dy, s, c=c, w=w, align=a)
lab('t', 'TERMINAL TEXT', -40, 22)
lab('c', 'CARTOON CHARACTER', -120, -42)
lab('v', 'NEAR-HUMAN AVATAR', 24, 0, c='{{amberText}}')
lab('p', 'A PERSON', -150, 22, w=120, a='right')
B.raw(f'<div style="position: absolute; left: {X0+900}px; top: {Y0+H+16}px; width: 140px; text-align: center; font-size: 13px; line-height: 16px; letter-spacing: 2px; color: {{{{amberText}}}}">THE VALLEY</div>')
B.label(X0 + W - 300, Y0 + H + 48, 'HUMAN LIKENESS →', w=300, align='right', c='{{ink}}')
B.label(X0 - 4, Y0 - 44, '↑ AFFINITY', c='{{ink}}')
B.label(X0 - 4, Y0 + BL + 8, 'NEUTRAL', size=13)
B.text(1456, 128, 'WHY GIVE AI A BODY?', size=16, weight=400, w=272)
B.text(1456, 160, 'It looks friendly.<br>It looks trustworthy.<br>Until it looks almost human.', size=22, ls=0, lh=32, w=272, c='{{mute}}')
B.label(1456, 728, 'AFTER MORI, 1970 · SCHEMATIC', w=272, size=14)
B.save('UncannyValley.dc.html')
