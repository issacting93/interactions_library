from dc import *
B = Board('Renaissance chain', 1792, 828)
Y = 500; A, Bx, C, D = 216, 760, 1120, 1600
# rail with a break between antiquity and the 14th c.
B.svg(64, Y - 20, 1056, 40, f'<path d="M0 20 H{456-64-12} M{456-64+12} 20 H1056" stroke-width="1.5"/><path d="M{456-64-18} 32 L{456-64-6} 8 M{456-64+6} 32 L{456-64+18} 8"/>' +
      ''.join(f'<rect x="{x-64-6}" y="14" width="12" height="12" fill="{{{{ink}}}}" stroke="none"/>' for x in (A, Bx, C)), 'Timeline rail')
B.line(C + 8, Y, D - 13, Y, head=True, c='{{amber}}', sw=2)
B.svg(D - 12, Y - 12, 24, 24, '<rect x="0" y="0" width="24" height="24" fill="{{amber}}" stroke="none"/>', None)
# looking back: the arc from the 14th c. to antiquity
B.svg(A, 176, C - A, Y - 176 - 16, f'<path d="M{C-A} {Y-176-16} C {C-A} 0, 0 0, 0 {Y-176-16}" stroke-dasharray="8 8"/><path d="M-8 {Y-176-32} L0 {Y-176-16} L8 {Y-176-32}" stroke-width="1.5"/>', 'An arc reaching back from the 14th century to antiquity')
B.raw(f'<div style="position: absolute; left: {(A+C)//2 - 90}px; top: 212px; width: 180px; text-align: center; font-size: 14px; line-height: 18px; letter-spacing: 2px; color: {{{{mute}}}}">LOOKING BACK</div>')
# icons under the stations
icons = {
 A: '<path d="M10 0 H90 M16 10 H84 M10 0 V10 M90 0 V10" stroke-width="1.5"/>' + ''.join(f'<path d="M{x} 18 V88"/>' for x in (26, 38, 50, 62, 74)) + '<path d="M18 88 H82 M10 96 H90"/>',
 Bx: ''.join(f'<rect x="{(i%4)*24}" y="{(i//4)*24+24}" width="16" height="16" {"fill=\"{{ink}}\" stroke=\"none\"" if i in (1,4,6,9,11) else ""}/>' for i in range(12)),
 C: '<path d="M50 20 C 34 8, 12 8, 0 14 V90 C 12 84, 34 84, 50 96 C 66 84, 88 84, 100 90 V14 C 88 8, 66 8, 50 20 Z" stroke-width="1.5"/><path d="M50 20 V96"/>' + ''.join(f'<path d="M12 {y} H40 M60 {y} H88"/>' for y in (34, 46, 58, 70)),
 D: '<path d="M0 96 H100 M14 96 V48 A36 36 0 0 1 86 48 V96" stroke-width="1.5"/><path d="M26 96 V52 A24 24 0 0 1 74 52 V96"/><path d="M50 0 V12 M44 12 H56"/>',
}
for x, body in icons.items():
    B.svg(x - 50, 560, 100, 100, body, None)
for x, h, t in [(A, 'ANTIQUITY', 'Greece and Rome'), (Bx, '1347–1351', 'The Black Death'), (C, '14TH–16TH C.', 'Recover and translate'), (D, 'THE RESULT', 'New work that went further')]:
    c = '{{amberText}}' if x == D else '{{ink}}'
    B.text(x - 140, 684, h, size=16, weight=400, w=280, align='center', c=c)
    B.text(x - 140, 710, t, size=20, ls=0, w=280, align='center', c='{{mute}}')
B.text(64, 64, 'They looked back to go forward.', size=32, ls=0)
B.label(1728 - 240, 72, 'FIG. 07 · NOT TO SCALE', w=240, align='right')
B.save('Renaissance.dc.html')
