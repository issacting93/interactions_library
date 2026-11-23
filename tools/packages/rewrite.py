# Rewrites every reference to a moved file, then moves the files. Run from the repo root:
#   python3 rewrite.py moves.tsv [--dry]
# A. Anywhere in the repo: "shared/<path>" (after any prefix that reaches the repo root) -> its new path.
# B. Inside a moved file: a relative path ("./x", "../x") that resolved from its old place -> the same target from its new place.
# Prints what it could not resolve; those are fixed by hand.
import os, re, sys, subprocess, collections
moves = dict(l.rstrip('\n').split('\t') for l in open(sys.argv[1]) if l.strip()); dry = '--dry' in sys.argv
newof = lambda p: moves.get(p, p)
def dirmap(d):   # a folder whose files all moved together keeps its shape: its new folder, else None
    d = d.rstrip('/') + '/'; fs = [f for f in moves if f.startswith(d)]
    if not fs: return None
    cands = {moves[f][:len(moves[f]) - len(f) + len(d)] for f in fs if moves[f].endswith(f[len(d):])}
    return cands.pop() if len(cands) == 1 and all(moves[f].endswith(f[len(d):]) for f in fs) else None
SKIP_DIR = {'.git', 'node_modules', 'target', 'dist', '.vercel'}
SKIP_FILE = {'tools/packages/plan.py', 'tools/packages/rewrite.py', 'tools/packages/moves.tsv', 'tools/packages/README.md'}   # its own table
SKIP_UNDER = ('games/the-maw/src/engine/', 'games/the-maw/engine/')   # the engine's fingerprint covers these: a comment change would fail check:engine
TEXT = {'.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.json', '.md', '.py', '.yml', '.yaml', '.sh', '.toml', '.txt', '.svg', '.code-workspace', ''}
files = []
for root, ds, fs in os.walk('.'):
    ds[:] = [d for d in ds if d not in SKIP_DIR]
    for n in fs:
        p = os.path.normpath(os.path.join(root, n))
        if p in SKIP_FILE or p.startswith(SKIP_UNDER): continue
        if os.path.splitext(n)[1] in TEXT or n in ('.gitignore', '.vercelignore'): files.append(p)
TOK = re.compile(r'shared/[A-Za-z0-9_./@%+-]*')
REL = re.compile(r'''(?P<q>["'`(])(?P<p>\.{1,2}/[^"'`()\s]*)''')
unresolved = collections.Counter(); changed = {}; counts = collections.Counter()
def fixA(s, where):
    def rep(m):
        t = m.group(0); t0 = t
        while t and t not in moves and not os.path.isdir(t.rstrip('/') or '.'):   # trailing punctuation: shorten to a real path
            if t[-1] in '.,;:)': t = t[:-1]
            else: break
        tail = t0[len(t):]
        if t in moves: counts['A file'] += 1; return moves[t] + tail
        if os.path.isdir(t.rstrip('/')):
            d = dirmap(t)
            if d is not None: counts['A dir'] += 1; return (d if t.endswith('/') else d.rstrip('/')) + tail
        unresolved[(where, t0)] += 1; return t0
    return TOK.sub(rep, s)
def fixB(s, old, new):
    od, nd = os.path.dirname(old), os.path.dirname(new)
    def rep(m):
        p = m.group('p'); base = p.split('?')[0].split('#')[0]; extra = p[len(base):]
        tgt = os.path.normpath(os.path.join(od, base))
        if tgt.startswith('..'): return m.group(0)
        if not (os.path.exists(tgt)): return m.group(0)
        isdir = os.path.isdir(tgt)
        nt = (dirmap(tgt) or tgt).rstrip('/') if isdir and tgt.startswith('shared') else newof(tgt)
        if isdir and tgt.startswith('shared') and dirmap(tgt) is None: unresolved[(old, p)] += 1; return m.group(0)
        r = os.path.relpath(nt, nd or '.')
        if not r.startswith('.'): r = './' + r
        if base.endswith('/') and not r.endswith('/'): r += '/'
        if r == base: return m.group(0)
        counts['B rel'] += 1; return m.group('q') + r + extra
    return REL.sub(rep, s)
for p in files:
    try: s = open(p, encoding='utf-8').read()
    except Exception: continue
    t = s
    if p in moves and not p.endswith(('.js', '.ts')): t = fixB(t, p, moves[p])   # a browser script's paths resolve against its page, not itself
    if 'shared/' in t:
        if p in moves:   # inside a moved file, a "shared/..." reached through a relative prefix was already handled by B; the rest (root-absolute, prose) by A
            t = fixA(t, p)
        else: t = fixA(t, p)
    if t != s: changed[p] = t
print('files changed', len(changed), dict(counts))
for (w, t), n in sorted(unresolved.items()): print('UNRESOLVED', w, t, n)
if dry: sys.exit(0)
for p, t in changed.items(): open(p, 'w', encoding='utf-8').write(t)
done = 0
for o, n in moves.items():
    if not os.path.exists(o): continue   # already moved (a branch merged with main)
    os.makedirs(os.path.dirname(n), exist_ok=True); subprocess.run(['git', 'mv', o, n], check=True); done += 1
print('moved', done)
