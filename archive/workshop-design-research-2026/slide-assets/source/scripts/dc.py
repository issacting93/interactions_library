"""Helpers for TE-style .dc.html artboards: separate placed elements on one host."""
import json
ROOT = '/tmp/claude-0/-home-claude/fc9e57f9-d325-5344-ae25-037759940747/scratchpad/canvas1/project/'
AMB = '#f0a800'
FONT = "Inter, ui-sans-serif, sans-serif"

class Board:
    def __init__(self, title, w, h, dark=False):
        self.title, self.w, self.h, self.dark = title, w, h, dark
        self.els = []
        self.n = 0

    # ---- primitives -------------------------------------------------
    def text(self, x, y, s, size=18, c='{{ink}}', w=None, align='left', weight=300, ls=2, lh=None, extra=''):
        ws = f' width: {w}px;' if w else ''
        lh = lh or round(size * 1.3)
        self.els.append(f'<div style="position: absolute; left: {x}px; top: {y}px;{ws} font-size: {size}px; line-height: {lh}px; font-weight: {weight}; letter-spacing: {ls}px; text-align: {align}; color: {c};{extra}">{s}</div>')

    def label(self, x, y, s, c='{{mute}}', size=16, **k):
        self.text(x, y, s, size=size, c=c, **k)

    def box(self, x, y, w, h, c='{{ink}}', sw=1.5, dash=False, fill='transparent', inner='', pad=16, align='flex-end', justify='flex-start', size=16, tc='{{mute}}', gap=8, col=True):
        style = 'dashed' if dash else 'solid'
        fd = 'column' if col else 'row'
        self.els.append(f'<div style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px; box-sizing: border-box; padding: {pad}px; display: flex; flex-direction: {fd}; gap: {gap}px; align-items: {"flex-start" if col else "center"}; justify-content: {align}; background: {fill}; border: {sw}px {style} {c}; font-size: {size}px; line-height: {round(size*1.3)}px; letter-spacing: 2px; font-weight: 300; color: {tc}">{inner}</div>')

    def svg(self, x, y, w, h, body, label=None):
        a = f'role="img" aria-label="{label}"' if label else 'aria-hidden="true"'
        self.els.append(f'<svg {a} width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px; overflow: visible; fill: none; stroke: {{{{ink}}}}; stroke-width: 1.5; stroke-linecap: square">{body}</svg>')

    def line(self, x1, y1, x2, y2, c='{{ink}}', sw=1.5, head=False, dash=None):
        """Straight horizontal or vertical segment, the editor's arrow svg."""
        hz = y1 == y2
        h = 2 * sw if head else 0
        ds = f' stroke-dasharray: {dash};' if dash else ''
        if hz:
            x, n = min(x1, x2), abs(x2 - x1)
            box = f'left: {x}px; top: {y1 - 4}px; width: {n}px; height: 8px'
            wh = f'width="{n}" height="8" viewBox="0 0 {n} 8"'
            d = f'M 0 4 L {n - h} 4' if x2 > x1 else f'M {n} 4 L {h} 4'
        else:
            y, n = min(y1, y2), abs(y2 - y1)
            box = f'left: {x1 - 4}px; top: {y}px; width: 8px; height: {n}px'
            wh = f'width="8" height="{n}" viewBox="0 0 8 {n}"'
            d = f'M 4 0 L 4 {n - h}' if y2 > y1 else f'M 4 {n} L 4 {h}'
        defs = me = ''
        if head:
            self.n += 1
            mid = f'dc-arrow-head-filled-{self.n}'
            defs = f'<defs><marker id="{mid}" orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill="{c}" stroke="none" style="stroke: none; fill: {c}; fill: context-stroke"/></marker></defs>'
            me = f' marker-end="url(#{mid})"'
        self.els.append(f'<svg aria-hidden="true" {wh} preserveAspectRatio="none" style="position: absolute; {box}; overflow: visible; fill: none; stroke: {c}; stroke-width: {sw};{ds} stroke-linecap: square; stroke-linejoin: miter">{defs}<path d="{d}"{me}></path></svg>')

    def dimh(self, x1, x2, y, s, c='{{ink}}', above=True, size=16):
        """Engineering dimension line: end ticks, open arrows both ends, label centred."""
        n = x2 - x1
        body = (f'<path d="M0 4 H{n} M0 -6 V14 M{n} -6 V14"/>'
                f'<path d="M12 0 L0 4 L12 8 M{n-12} 0 L{n} 4 L{n-12} 8"/>')
        self.els.append(f'<svg aria-hidden="true" width="{n}" height="8" viewBox="0 0 {n} 8" style="position: absolute; left: {x1}px; top: {y-4}px; width: {n}px; height: 8px; overflow: visible; fill: none; stroke: {c}; stroke-width: 1">{body}</svg>')
        tw = len(s) * (size * 0.72) + 24
        ty = y - size - 18 if above else y + 14
        self.text(round((x1 + x2) / 2 - tw / 2), ty, s, size=size, c=c, w=round(tw), align='center')

    def dimv(self, x, y1, y2, s, c='{{ink}}', size=16, side='left'):
        n = y2 - y1
        body = (f'<path d="M4 0 V{n} M-6 0 H14 M-6 {n} H14"/>'
                f'<path d="M0 12 L4 0 L8 12 M0 {n-12} L4 {n} L8 {n-12}"/>')
        self.els.append(f'<svg aria-hidden="true" width="8" height="{n}" viewBox="0 0 8 {n}" style="position: absolute; left: {x-4}px; top: {y1}px; width: 8px; height: {n}px; overflow: visible; fill: none; stroke: {c}; stroke-width: 1">{body}</svg>')
        tw = len(s) * (size * 0.72) + 24
        cy = (y1 + y2) / 2
        lx = x - 24 - round(size * 1.3) if side == 'left' else x + 24
        self.text(round(lx + size * 0.65 - tw / 2), round(cy - size * 0.65), s, size=size, c=c, w=round(tw), align='center',
                  extra=' transform: rotate(-90deg); transform-origin: center;')

    def raw(self, s):
        self.els.append(s)

    # ---- output -----------------------------------------------------
    def html(self):
        props = {"dark": {"editor": "boolean", "default": self.dark, "section": "Theme"},
                 "$preview": {"width": self.w, "height": self.h}}
        pj = json.dumps(props, ensure_ascii=False).replace("'", '&#39;')
        d = 'true' if self.dark else 'false'
        body = '\n'.join(self.els)
        return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{self.title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400&amp;display=swap">
<style>
body{{margin:0}}
a{{color:#6a6a6a}}a:hover{{color:#000}}
</style>
</helmet>
<div style="position: relative; width: {self.w}px; height: {self.h}px; overflow: hidden; background: {{{{ground}}}}; color: {{{{ink}}}}; font-family: {FONT}; font-weight: 300">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{pj}'>
class Component extends DCLogic {{
  renderVals() {{
    const dark = this.props.dark ?? {d};
    return dark
      ? {{ ground: '#0f0e12', ink: '#f6f8f7', mute: '#8a8a8a', rule: '#4a4950', panel: '#18171c', amber: '#f0a800', amberText: '#f0a800' }}
      : {{ ground: '#f6f8f7', ink: '#000000', mute: '#5f5f5f', rule: '#b2b2b2', panel: '#ffffff', amber: '#f0a800', amberText: '#8a5c00' }};
  }}
}}
</script>
</body>
</html>
'''

    def save(self, name):
        open(ROOT + name, 'w').write(self.html())
        print(name, len(self.els), 'elements')
