from dc import *
B = Board('Question sheet', 794, 1123)
box = '<span style="display: inline-block; width: 16px; height: 16px; box-sizing: border-box; border: 1.5px solid {{ink}}; flex: none"></span>'
def opts(items):
    return '<div style="display: flex; flex-wrap: wrap; gap: 12px 28px">' + ''.join(f'<span style="display: flex; align-items: center; gap: 8px; font-size: 14px">{box}{t}</span>' for t in items) + '</div>'
def scale(lo, hi):
    cells = ''.join(f'<div style="flex: 1; height: 36px; box-sizing: border-box; border: 1.5px solid {{{{ink}}}}; margin-left: -1.5px; display: flex; align-items: center; justify-content: center; font-size: 14px">{i}</div>' for i in range(1, 6))
    return (f'<div style="display: flex; flex-direction: column; gap: 6px"><div style="display: flex">{cells}</div>'
            f'<div style="display: flex; justify-content: space-between; font-size: 12px; letter-spacing: 1.5px; color: {{{{mute}}}}"><span>{lo}</span><span>{hi}</span></div></div>')
def lines(n):
    return '<div style="display: flex; flex-direction: column; gap: 0">' + ''.join('<div style="height: 28px; border-bottom: 1px solid {{rule}}"></div>' for _ in range(n)) + '</div>'
qs = [
 ('How often do they use AI chatbots?', scale('RARELY', 'CONSTANTLY')),
 ('What for?', opts(['Getting things done', 'Advice', 'Company', 'Other: ________'])),
 ('How connected do they feel to the people around them?', scale('ISOLATED', 'CONNECTED')),
 ('Has a chatbot replaced something they used to do with a person?', opts(['Yes', 'No', 'Not sure']) + lines(1)),
 ('Is it making their life better, or worse?', opts(['Better', 'Worse', 'Not sure']) + lines(1)),
]
qhtml = ''.join(
 f'<div style="display: flex; gap: 20px; padding: 16px 0; border-top: 1px solid {{{{ink}}}}">'
 f'<div style="width: 32px; flex: none; font-size: 28px; line-height: 28px; font-weight: 200">{i+1}</div>'
 f'<div style="flex: 1; display: flex; flex-direction: column; gap: 12px"><div style="font-size: 17px; line-height: 24px; font-weight: 400">{q}</div>{a}</div></div>'
 for i, (q, a) in enumerate(qs))
B.raw(f'''<div style="position: absolute; left: 72px; top: 64px; width: 650px; display: flex; flex-direction: column; gap: 0; color: {{{{ink}}}}">
<div style="display: flex; justify-content: space-between; font-size: 12px; line-height: 16px; letter-spacing: 2px; color: {{{{mute}}}}"><span>WORKSHOP · INTERVIEW SHEET</span><span>NO. ____</span></div>
<h1 style="margin: 16px 0 0; font-size: 40px; line-height: 48px; font-weight: 300; letter-spacing: -0.5px">Think of one person</h1>
<p style="margin: 8px 0 20px; font-size: 15px; line-height: 22px; color: {{{{mute}}}}">Your partner asks you five questions about someone in your life. No names. Then swap.</p>
<div style="display: flex; gap: 24px; padding-bottom: 20px; font-size: 12px; letter-spacing: 2px; color: {{{{mute}}}}"><div style="flex: 1; display: flex; flex-direction: column; gap: 4px"><span>WHO THEY ARE TO YOU</span><div style="height: 24px; border-bottom: 1px solid {{{{ink}}}}"></div></div><div style="width: 160px; display: flex; flex-direction: column; gap: 4px"><span>AGE RANGE</span><div style="height: 24px; border-bottom: 1px solid {{{{ink}}}}"></div></div></div>
{qhtml}
<div style="display: flex; gap: 20px; align-items: center; padding: 16px; border: 1.5px solid {{{{ink}}}}; margin-top: 4px">
<svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64" style="flex: none; width: 64px; height: 64px; fill: none; stroke: {{{{ink}}}}; stroke-width: 1.5"><path d="M4 4 V60 H60"/><rect x="38" y="16" width="10" height="10" fill="{{{{ink}}}}" stroke="none"/><rect x="22" y="34" width="10" height="10" fill="{{{{amber}}}}" stroke="none"/></svg>
<div style="font-size: 14px; line-height: 21px"><b style="font-weight: 400; letter-spacing: 2px; font-size: 12px">ON THE WALL</b><br>Place a dot at question 1 (across) and question 3 (up). Black if it’s making life better, amber if worse.</div>
</div>
</div>''')
B.label(72, 1059, 'DESIGN RESEARCH IN THE AGE OF AI', size=12, w=400)
B.save('QuestionSheet.dc.html')
