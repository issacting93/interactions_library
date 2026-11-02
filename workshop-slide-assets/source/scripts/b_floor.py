from dc import *
B = Board('Floor and ceiling', 1792, 828)
X0, X1 = 64, 1264; W = X1 - X0
CEIL, NEWC, OLDF, FLOOR = 216, 152, 520, 664
hatch = lambda h: ''.join(f'<path d="M{x} {h} L{x+h} 0"/>' for x in range(-h, W, 24))
B.svg(X0, CEIL - 32, W, 32, hatch(32), 'Ceiling slab')
B.svg(X0, FLOOR, W, 32, hatch(32), 'Floor slab')
B.line(X0, CEIL, X1, CEIL, sw=2)
B.line(X0, FLOOR, X1, FLOOR, sw=2)
B.line(X0, OLDF, X1, OLDF, c='{{mute}}', sw=1.5, dash='8 8')
B.line(X0, NEWC, X1, NEWC, c='{{amber}}', sw=2, dash='8 8')
for x in (264, 664, 1064):
    B.line(x, OLDF + 8, x, FLOOR - 1, head=True)
    B.line(x, CEIL - 4, x, NEWC + 1, c='{{amber}}', sw=2, head=True)
# labels on the drawing
B.label(X0 + 16, OLDF - 30, 'WHERE THE FLOOR USED TO BE')
B.label(280, (OLDF + FLOOR) // 2 - 8, 'LOWERED BY AI', c='{{ink}}')
B.label(X0 + 16, NEWC - 30, 'WHERE THE CEILING CAN GO', c='{{amberText}}')
B.label(X0 + 16, FLOOR + 48, 'FLOOR · ANYONE CAN START')
B.label(X0 + 16, CEIL + 16, 'CEILING · TODAY')
# dimensions
B.dimv(1344, CEIL, FLOOR, 'WHERE CRAFT LIVES')
B.dimv(1344, NEWC, CEIL, 'LAST 5%', size=13, c='{{amberText}}')
# notes
B.text(1456, 216, 'THE CEILING', size=16, weight=400)
B.text(1456, 244, 'Mastery, polish, finish. Craft pushes it up.', size=20, ls=0, w=272, c='{{mute}}', lh=28)
B.text(1456, 520, 'THE FLOOR', size=16, weight=400)
B.text(1456, 548, 'AI lowers it. More people come in.', size=20, ls=0, w=272, c='{{mute}}', lh=28)
B.label(1456, 728, 'FIG. 04 · SECTION', w=272)
B.save('FloorCeiling.dc.html')
