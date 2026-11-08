from dc import *
B = Board('Making vs discovering', 1792, 828)
CW, CH, ST, TOP = 234, 120, 286, 264
XS = [64 + i*ST for i in range(6)]; CY = TOP + CH//2
stages = ['OBSERVE','STRUCTURE','ABSTRACTION','REFINEMENT','BUILD','TEST']
for g, s in enumerate(['RESEARCH','DESIGN','ENGINEER']):
    B.dimh(XS[2*g], XS[2*g+1] + CW, 192, s)
for i in range(5):
    amber = i == 3
    B.line(XS[i] + CW, CY, XS[i+1] - 1, CY, head=True, c='{{amber}}' if amber else '{{ink}}', sw=2 if amber else 1.5)
for i, s in enumerate(stages):
    hard = i in (0, 5)
    bd = '1.5px dashed {{ink}}' if hard else '1.5px solid {{ink}}'
    B.raw(f'<div style="position: absolute; left: {XS[i]}px; top: {TOP}px; width: {CW}px; height: {CH}px; box-sizing: border-box; padding: 16px; display: flex; align-items: flex-end; background: {{{{ground}}}}; border: {bd}; font-size: 18px; line-height: 24px; letter-spacing: 2px"><span><span style="color: {{{{mute}}}}">0{i+1}</span><br>{s}</span></div>')
# annotations under the row
B.raw(f'<div style="position: absolute; left: {XS[3]+CW-60}px; top: {TOP+CH+24}px; width: 172px; text-align: center; font-size: 14px; line-height: 18px; letter-spacing: 2px; color: {{{{amberText}}}}">EASIER WITH AI</div>')
for i in (0, 5):
    B.raw(f'<div style="position: absolute; left: {XS[i]}px; top: {TOP+CH+24}px; width: {CW}px; font-size: 14px; line-height: 18px; letter-spacing: 2px; color: {{{{mute}}}}">HARDER WITH AI</div>')
# legend
B.box(64, 520, 28, 28, sw=1.5)
B.label(108, 524, 'MAKING', c='{{ink}}')
B.box(256, 520, 28, 28, sw=1.5, dash=True)
B.label(300, 524, 'DISCOVERING', c='{{ink}}')
B.text(64, 600, 'AI closes the gap between seeing it and building it.<br>Observing and testing get harder.', size=32, ls=0, lh=44, w=1300)
B.label(1728-240, 728, 'FIG. 05', w=240, align='right')
B.save('MakingDiscovering.dc.html')
