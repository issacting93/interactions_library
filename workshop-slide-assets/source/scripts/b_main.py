from dc import *
B = Board('Toolbox', 1792, 828, dark=True)
O = 64
def X(v): return v + O
# dimensions
B.dimh(X(110), X(1190), X(40), 'ONE TOOLBOX')
B.dimv(X(70), X(70), X(660), 'MANY JOBS')
# the box
B.box(X(110), X(70), 1080, 590, sw=2)
B.box(X(130), X(90), 1040, 550, sw=1)
# filled compartments (label sits bottom-left inside)
for x, y, w, h, s in [(150,110,370,160,'PENCIL'),(540,110,280,160,'RULER'),(840,110,310,160,'PEN TOOL'),
                      (150,290,250,160,'SWATCHES'),(420,290,280,160,'STICKIES')]:
    B.box(X(x), X(y), w, h, inner=s)
# empty, dashed compartments
for x, y, w, h, s in [(720,290,430,160,'SIMULATION'),(150,470,320,150,'STATISTICS'),(490,470,290,150,'EVALS'),(800,470,350,150,'SOCIAL SCIENCE')]:
    plus = '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" style="width: 28px; height: 28px; fill: none; stroke: {{mute}}; stroke-width: 2"><path d="M0 14 H28 M14 0 V28"/></svg>'
    B.raw(f'<div style="position: absolute; left: {X(x)}px; top: {X(y)}px; width: {w}px; height: {h}px; box-sizing: border-box; border: 1.5px dashed {{{{mute}}}}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; font-size: 20px; line-height: 26px; letter-spacing: 2px; color: {{{{mute}}}}">{plus}<span>{s}</span></div>')
# tools, drawn
B.svg(X(166), X(165), 340, 54, '<rect x="24" y="10" width="250" height="34" stroke-width="2"/><rect x="0" y="10" width="24" height="34" stroke-width="2"/><path d="M34 10 V44 M42 10 V44"/><path d="M274 10 L330 27 L274 44 Z" stroke-width="2"/><path d="M316 23 L330 27 L316 31 Z" fill="{{ink}}" stroke-width="2"/>', 'Pencil')
ticks = ''.join(f'<path d="M{12*i} 0 V{18 if i%5==0 else 9}"/>' for i in range(1, 19))
B.svg(X(566), X(165), 228, 44, f'<rect x="0" y="0" width="228" height="44" stroke-width="2"/>{ticks}', 'Ruler')
B.svg(X(866), X(124), 260, 116, '<path d="M14 101 C 64 -4, 184 -4, 244 91" stroke-width="2"/><path d="M14 101 L64 16 M244 91 L184 11" stroke="{{mute}}"/><rect x="7" y="94" width="14" height="14" fill="{{ink}}" stroke="none"/><rect x="237" y="84" width="14" height="14" fill="{{ink}}" stroke="none"/><circle cx="64" cy="16" r="6" stroke-width="2"/><circle cx="184" cy="11" r="6" stroke-width="2"/>', 'Pen tool curve')
B.svg(X(176), X(335), 196, 40, '<rect x="0" y="0" width="40" height="40" stroke-width="2"/><rect x="52" y="0" width="40" height="40" stroke-width="2"/><rect x="104" y="0" width="40" height="40" fill="{{amber}}" stroke="{{amber}}" stroke-width="2"/><rect x="156" y="0" width="40" height="40" stroke-width="2"/>', 'Colour swatches')
B.svg(X(490), X(318), 138, 98, '<rect x="0" y="0" width="90" height="70" fill="{{ground}}" stroke-width="2"/><rect x="24" y="14" width="90" height="70" fill="{{ground}}" stroke-width="2"/><rect x="48" y="28" width="90" height="70" fill="{{ground}}" stroke-width="2"/>', 'Sticky notes')
# side elevation
B.dimh(X(1250), X(1290), X(40), 'DEPTH')
B.svg(X(1250), X(70), 52, 590, '<rect x="0" y="0" width="40" height="590" stroke-width="2"/><path d="M0 20 H40 M0 570 H40" stroke-width="1"/><rect x="40" y="260" width="12" height="70" stroke-width="2"/><circle cx="20" cy="40" r="6" stroke-width="2"/><circle cx="20" cy="550" r="6" stroke-width="2"/>', 'Side view of the toolbox')
# legend
B.box(X(1370), X(120), 34, 34, sw=2)
B.text(X(1424), X(124), 'IN THE BOX', size=22)
B.box(X(1370), X(190), 34, 34, sw=2, dash=True, c='{{mute}}')
B.text(X(1424), X(194), 'MISSING', size=22, c='{{mute}}')
B.label(X(1370), X(578), 'TOOLS NOT TO SCALE', size=18)
B.label(X(1370), X(610), 'FIG. 01', size=18)
B.save('Main.dc.html')
