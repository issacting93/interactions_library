from dc import *
B = Board('Wall plot poster', 1587, 1123)
PX, PY, PW, PH = 232, 248, 1000, 760
cw, ch = PW // 5, PH // 5
grid = ''.join(f'<path d="M{i*cw} 0 V{PH}" stroke="{{{{rule}}}}" stroke-width="1"/>' for i in range(1, 5))
grid += ''.join(f'<path d="M0 {j*ch} H{PW}" stroke="{{{{rule}}}}" stroke-width="1"/>' for j in range(1, 5))
grid += f'<rect x="0" y="0" width="{PW}" height="{PH}" stroke-width="2"/>'
B.svg(PX, PY, PW, PH, grid, 'An empty five by five grid for dots')
B.text(72, 72, 'WORKSHOP · THE WALL', size=16, c='{{mute}}')
B.text(72, 104, 'Put them on the wall', size=56, weight=300, ls=-1, lh=64)
for i in range(5):
    B.text(PX + i*cw, PY + PH + 16, str(i+1), size=20, w=cw, align='center', ls=0)
    B.text(PX - 56, PY + (4-i)*ch + ch//2 - 13, str(i+1), size=20, w=40, align='right', ls=0)
B.label(PX, PY + PH + 52, '← RARELY', size=14, c='{{ink}}', w=200)
B.label(PX + PW - 240, PY + PH + 52, 'CONSTANTLY →', size=14, c='{{ink}}', w=240, align='right')
B.text(PX + PW//2 - 200, PY + PH + 52, 'Q1 · USES AI', size=14, w=400, align='center', weight=400)
B.label(72, PY - 36, '↑ CONNECTED', size=14, c='{{ink}}', w=240)
B.label(72, PY + PH - 20, 'ISOLATED', size=14, c='{{ink}}', w=120)
B.text(72, PY - 64, 'Q3 · CONNECTED TO PEOPLE', size=14, weight=400, w=400)
# legend
RX = 1296
B.text(RX, PY, 'KEY', size=14, c='{{mute}}')
B.svg(RX, PY + 40, 24, 24, '<circle cx="12" cy="12" r="12" fill="{{ink}}" stroke="none"/>', 'Black dot')
B.text(RX + 40, PY + 40, 'Life better', size=22, ls=0, lh=24)
B.svg(RX, PY + 88, 24, 24, '<circle cx="12" cy="12" r="12" fill="{{amber}}" stroke="none"/>', 'Amber dot')
B.text(RX + 40, PY + 88, 'Life worse', size=22, ls=0, lh=24)
B.text(RX, PY + PH - 120, 'Where do the amber dots cluster?', size=28, ls=0, lh=36, w=219)
B.label(1587 - 72 - 400, 76, 'DESIGN RESEARCH IN THE AGE OF AI', size=12, w=400, align='right')
B.save('WallPoster.dc.html')
