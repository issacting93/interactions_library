"""Builds the companion slide 'the four ghosts, built' — a 4-up card row in the
same family as 02-craft-shifts / 08-computers-as-social-actors, answering the
dashed wireframe placeholders (simulation/statistics/evals/social science) on
01-toolbox with simplified line-icon versions of four of the Instagram_Visuals
generative pieces: compass (simulation), signal-wheel (statistics),
geared-reticle (evals), rosette (social science)."""
import math

W, H = 1792, 828
MARGIN = 96

TOKENS = {
    'dark':  dict(ground='#0f0e12', ink='#f6f8f7', mute='#8a8a8a', rule='#4a4950', amber='#f0a800'),
    'light': dict(ground='#f6f8f7', ink='#000000', mute='#5f5f5f', rule='#b2b2b2', amber='#f0a800'),
}

CARDS = [
    ('01', 'SIMULATION', 'Procedural instruments, not static comps.', 'compass'),
    ('02', 'STATISTICS', 'Confidence, modeled as a dial.', 'signal'),
    ('03', 'EVALS', 'Scan · lock · jam, not pass / fail.', 'reticle'),
    ('04', 'SOCIAL SCIENCE', 'Reading signals, not just inputs.', 'rosette'),
]

def p(x, y):
    return f'{x:.1f} {y:.1f}'

def icon_compass(cx, cy, r, ink, mute, amber):
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r}" stroke="{ink}" stroke-width="2"/>']
    for a in range(0, 360, 30):
        rad = math.radians(a)
        r1 = r - (14 if a % 90 == 0 else 7)
        x0, y0 = cx + r * math.sin(rad), cy - r * math.cos(rad)
        x1, y1 = cx + r1 * math.sin(rad), cy - r1 * math.cos(rad)
        out.append(f'<path d="M{p(x0,y0)} L{p(x1,y1)}" stroke="{mute}" stroke-width="1.5"/>')
    needle = math.radians(-35)
    nx, ny = cx + (r - 20) * math.sin(needle), cy - (r - 20) * math.cos(needle)
    out.append(f'<path d="M{p(cx,cy)} L{p(nx,ny)}" stroke="{ink}" stroke-width="2"/>')
    out.append(f'<circle cx="{nx:.1f}" cy="{ny:.1f}" r="4" fill="{ink}" stroke="none"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="3" fill="{ink}" stroke="none"/>')
    return ''.join(out)

def icon_signal(cx, cy, r, ink, mute, amber):
    out = []
    a0, a1 = math.radians(-150), math.radians(60)
    def arc(radius, start, end, stroke, sw):
        x0, y0 = cx + radius * math.cos(start), cy + radius * math.sin(start)
        x1, y1 = cx + radius * math.cos(end), cy + radius * math.sin(end)
        large = 1 if (end - start) % (2 * math.pi) > math.pi else 0
        return f'<path d="M{p(x0,y0)} A{radius:.1f} {radius:.1f} 0 {large} 1 {p(x1,y1)}" fill="none" stroke="{stroke}" stroke-width="{sw}"/>'
    out.append(arc(r, a0, a1, mute, 1.5))
    out.append(arc(r - 16, a0, a1, ink, 2))
    val = math.radians(-40)
    tx, ty = cx + (r - 16) * math.cos(val), cy + (r - 16) * math.sin(val)
    out.append(f'<circle cx="{tx:.1f}" cy="{ty:.1f}" r="5" fill="{amber}" stroke="none"/>')
    nx, ny = cx + (r - 34) * math.cos(val), cy + (r - 34) * math.sin(val)
    out.append(f'<path d="M{p(cx,cy)} L{p(nx,ny)}" stroke="{ink}" stroke-width="2"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="3" fill="{ink}" stroke="none"/>')
    return ''.join(out)

def icon_reticle(cx, cy, r, ink, mute, amber):
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r}" stroke="{ink}" stroke-width="2"/>',
           f'<circle cx="{cx}" cy="{cy}" r="{r-20}" stroke="{mute}" stroke-width="1.5"/>']
    for a in range(0, 360, 15):
        rad = math.radians(a)
        r0, r1 = r + 4, r + (12 if a % 90 == 0 else 8)
        x0, y0 = cx + r0 * math.sin(rad), cy - r0 * math.cos(rad)
        x1, y1 = cx + r1 * math.sin(rad), cy - r1 * math.cos(rad)
        out.append(f'<path d="M{p(x0,y0)} L{p(x1,y1)}" stroke="{mute}" stroke-width="1.5"/>')
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        out.append(f'<path d="M{cx+dx*(r-20)*0.4:.1f} {cy+dy*(r-20)*0.4:.1f} L{cx+dx*(r-20):.1f} {cy+dy*(r-20):.1f}" stroke="{ink}" stroke-width="2"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="3" fill="{ink}" stroke="none"/>')
    return ''.join(out)

def icon_rosette(cx, cy, r, ink, mute, amber):
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r}" stroke="{mute}" stroke-width="1.5" stroke-dasharray="2 5"/>',
           f'<circle cx="{cx}" cy="{cy}" r="22" stroke="{ink}" stroke-width="2"/>']
    for i, a in enumerate(range(0, 360, 45)):
        rad = math.radians(a)
        nx, ny = cx + (r - 18) * math.sin(rad), cy - (r - 18) * math.cos(rad)
        filled = i == 2
        out.append(f'<circle cx="{nx:.1f}" cy="{ny:.1f}" r="14" fill="{ink if filled else "none"}" stroke="{ink}" stroke-width="2"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="3" fill="{ink}" stroke="none"/>')
    return ''.join(out)

ICONS = {'compass': icon_compass, 'signal': icon_signal, 'reticle': icon_reticle, 'rosette': icon_rosette}


def dimh(x1, x2, y, s, c, size=16):
    n = x2 - x1
    body = (f'<path d="M0 4 H{n} M0 -6 V14 M{n} -6 V14"/>'
            f'<path d="M12 0 L0 4 L12 8 M{n-12} 0 L{n} 4 L{n-12} 8"/>')
    tw = len(s) * (size * 0.72) + 24
    return (f'<svg aria-hidden="true" width="{n}" height="8" viewBox="0 0 {n} 8" '
            f'style="position:absolute; left:{x1}px; top:{y-4}px; width:{n}px; height:8px; overflow:visible; '
            f'fill:none; stroke:{c}; stroke-width:1">{body}</svg>'
            f'<div style="position:absolute; left:{round(x1+n/2-tw/2)}px; top:{y-40}px; width:{round(tw)}px; '
            f'font-size:{size}px; line-height:{round(size*1.3)}px; font-weight:300; letter-spacing:2px; '
            f'text-align:center; color:{c}">{s}</div>')


def build(theme):
    t = TOKENS[theme]
    ink, mute, rule, amber, ground = t['ink'], t['mute'], t['rule'], t['amber'], t['ground']
    els = []
    els.append(dimh(MARGIN, W - MARGIN, 140, 'THE FOUR GHOSTS, BUILT', ink, size=18))

    content_w = W - 2 * MARGIN
    n = len(CARDS)
    gap = 48
    card_w = (content_w - (n - 1) * gap) / n
    card_h = 300
    card_top = 230
    icon_r = card_w * 0.26

    for i, (num, title, caption, key) in enumerate(CARDS):
        x = MARGIN + i * (card_w + gap)
        els.append(f'<div style="position:absolute; left:{x:.1f}px; top:{card_top}px; width:{card_w:.1f}px; '
                    f'height:{card_h}px; box-sizing:border-box; border:1.5px solid {rule};">'
                    f'<div style="position:absolute; left:16px; top:14px; font-size:14px; letter-spacing:2px; '
                    f'color:{mute}">{num}</div></div>')
        cx, cy = x + card_w / 2, card_top + card_h / 2 + 10
        body = ICONS[key](cx, cy, icon_r, ink, mute, amber)
        els.append(f'<svg aria-hidden="true" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
                    f'style="position:absolute; left:0; top:0; width:{W}px; height:{H}px; overflow:visible; '
                    f'fill:none; stroke-linecap:square">{body}</svg>')
        ty = card_top + card_h + 36
        els.append(f'<div style="position:absolute; left:{x:.1f}px; top:{ty}px; width:{card_w:.1f}px; '
                    f'font-size:26px; font-weight:400; letter-spacing:1px; color:{ink}">{title}</div>')
        els.append(f'<div style="position:absolute; left:{x:.1f}px; top:{ty+38}px; width:{card_w:.1f}px; '
                    f'font-size:19px; line-height:26px; font-weight:300; color:{mute}">{caption}</div>')

    baseline_y = card_top + card_h + 170
    els.append(f'<div style="position:absolute; left:{MARGIN}px; top:{baseline_y}px; width:{content_w}px; '
                f'height:1px; background:{rule}"></div>')
    els.append(f'<div style="position:absolute; left:{MARGIN}px; top:{baseline_y+20}px; font-size:16px; '
                f'letter-spacing:2px; color:{mute}">MISSING → BUILT</div>')
    els.append(f'<div style="position:absolute; left:{W-MARGIN-320}px; top:{baseline_y+20}px; width:320px; '
                f'text-align:right; font-size:16px; letter-spacing:2px; color:{mute}">FIG. 01B · NOT TO SCALE</div>')

    body = '\n'.join(els)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400&display=swap">
<style>html,body{{margin:0;padding:0;background:{ground}}}</style>
</head><body>
<div style="position:relative; width:{W}px; height:{H}px; overflow:hidden; background:{ground}; color:{ink}; font-family: Inter, ui-sans-serif, sans-serif; font-weight:300">
{body}
</div>
</body></html>'''

import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'canvas')
for theme in ('dark', 'light'):
    path = os.path.join(OUT, f'01b-the-missing-four-{theme}.html')
    open(path, 'w').write(build(theme))
    print('wrote', path)
