from dc import *
B = Board('A design, or a tool?', 1792, 828)
XS = [152, 548, 944, 1340]; CW, CH = 300, 120
def card(x, y, head, sub, inv=False, amber=False):
    bg = '{{ink}}' if inv else '{{ground}}'; fg = '{{ground}}' if inv else '{{ink}}'
    bd = '2px solid {{amber}}' if amber else '1.5px solid {{ink}}'
    B.raw(f'<div style="position: absolute; left: {x}px; top: {y}px; width: {CW}px; height: {CH}px; box-sizing: border-box; padding: 16px 20px; display: flex; align-items: center; background: {bg}; border: {bd}; color: {fg}; font-size: 20px; line-height: 28px; font-weight: 300"><span><b style="font-weight: 400; letter-spacing: 2px; font-size: 16px">{head}</b><br>{sub}</span></div>')
# lanes first
B.box(64, 120, 1664, 216, sw=1, c='{{rule}}')
B.box(64, 376, 1664, 264, sw=1, c='{{rule}}')
# arrows
for y in (236, 492):
    for i in range(3 if y == 492 else 2):
        B.line(XS[i] + CW, y, XS[i+1] - 1, y, head=True)
B.line(1490, 552, 1490, 600)
B.line(1490, 600, 1094, 600)
B.line(1094, 600, 1094, 553, head=True)
# cards
A = 176; Bt = 432
card(XS[0], A, 'YOU', 'Ask for a design')
card(XS[1], A, 'AI', 'Makes the decisions', inv=True)
card(XS[2], A, 'ONE OUTPUT', 'Take it or leave it')
card(XS[0], Bt, 'YOU', 'Ask for a tool')
card(XS[1], Bt, 'AI', 'Builds the tool', inv=True)
card(XS[2], Bt, 'THE TOOL', 'Sliders, rules, states')
card(XS[3], Bt, 'YOU', 'Find out what’s possible', amber=True)
# labels
B.label(88, 136, 'A · ASK AI FOR A DESIGN')
B.label(88, 392, 'B · ASK AI FOR A TOOL')
B.text(XS[3], 216, 'The decisions are<br>made for you.', size=20, c='{{mute}}', ls=0, w=300)
B.raw('<div style="position: absolute; left: 1192px; top: 612px; width: 200px; text-align: center; font-size: 13px; line-height: 16px; letter-spacing: 1px; color: {{mute}}">ADJUST, TRY AGAIN</div>')
B.text(64, 688, 'Tools shape craft. Now we can build our own.', size=28, ls=0, weight=300)
B.label(1728 - 240, 696, 'FIG. 03', w=240, align='right')
B.save('DesignVsTool.dc.html')
