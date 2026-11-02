from dc import *
B = Board('A bible, not a conversation', 1792, 828)
# --- left: the closed book, handed down
B.line(394, 404, 394, 452)
B.line(214, 452, 574, 452)
for x in (214, 394, 574):
    B.line(x, 452, x, 499, head=True)
book = ('<path d="M0 40 H260 V300 H0 Z" stroke-width="2"/>'
        '<path d="M0 40 L40 0 H300 L260 40" stroke-width="2"/>'
        '<path d="M260 300 L300 260 V0" stroke-width="2"/>'
        + ''.join(f'<path d="M{260+k} {40-k} V{300-k}" stroke="{{{{mute}}}}"/>' for k in (10, 20, 30))
        + '<rect x="70" y="110" width="120" height="120"/><path d="M130 130 V210 M100 160 H160" />')
B.svg(264, 104, 300, 300, book, 'A closed book')
for x in (214, 394, 574):
    B.box(x - 70, 500, 140, 56, sw=1.5, inner='THEIR APP', align='center', size=13, pad=8)
B.text(64, 600, 'DESIGN SYSTEMS', size=16, weight=400)
B.text(64, 626, 'Answers, handed down. Hard to give back to.', size=22, ls=0, c='{{mute}}')
# --- right: the conversation, a citation network
nodes = [(40,60),(180,20),(330,90),(500,40),(600,170),(450,220),(260,250),(90,210),(170,330),(380,350),(560,320),(320,170)]
edges = [(0,1),(1,2),(2,3),(3,4),(4,5),(5,11),(11,2),(11,6),(6,7),(7,0),(7,8),(8,9),(9,10),(10,4),(6,9),(1,11),(5,10),(0,11)]
net = ''.join(f'<path d="M{nodes[a][0]} {nodes[a][1]} L{nodes[b][0]} {nodes[b][1]}" stroke="{{{{mute}}}}" stroke-width="1"/>' for a, b in edges)
net += ''.join(f'<rect x="{x-9}" y="{y-9}" width="18" height="18" fill="{{{{ground}}}}" stroke-width="1.5"/>' for i, (x, y) in enumerate(nodes) if i != 11)
net += '<rect x="308" y="158" width="24" height="24" fill="{{amber}}" stroke="none"/>'
B.svg(1064, 120, 620, 360, net, 'A network of papers citing each other')
B.label(1064 + 348, 120 + 158, 'YOU', c='{{amberText}}')
B.text(992, 600, 'RESEARCH', size=16, weight=400)
B.text(992, 626, 'Built to be argued with. Hidden behind paywalls.', size=22, ls=0, c='{{mute}}')
# --- the bridge, built from both sides
L, R, D, T = 64, 1728, 724, 692
gap0, gap1 = 760, 1032
tr = f'<path d="M{L} {D} H{gap0} M{gap1} {D} H{R}" stroke-width="2"/><path d="M{gap0} {D} H{gap1}" stroke="{{{{mute}}}}" stroke-dasharray="8 8"/>'
tr += f'<path d="M{L} {T} H{gap0} M{gap1} {T} H{R}"/>'
for x in range(L, gap0 + 1, 56):
    tr += f'<path d="M{x} {T} V{D}"/>' + (f'<path d="M{x} {D} L{x+56} {T}"/>' if x + 56 <= gap0 else '')
for x in range(R, gap1 - 1, -56):
    tr += f'<path d="M{x} {T} V{D}"/>' + (f'<path d="M{x} {D} L{x-56} {T}"/>' if x - 56 >= gap1 else '')
B.svg(0, 680, 1792, 56, f'<g transform="translate(0 -680)">{tr}</g>', 'A truss bridge built from both banks, unfinished in the middle')
B.raw(f'<div style="position: absolute; left: {gap0}px; top: {D + 16}px; width: {gap1-gap0}px; text-align: center; font-size: 14px; line-height: 18px; letter-spacing: 2px; color: {{{{mute}}}}">FROM BOTH SIDES</div>')
B.label(1728 - 240, 744, 'FIG. 06', w=240, align='right')
B.save('BibleConversation.dc.html')
