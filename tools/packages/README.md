# Moving a branch onto packages/

On 22 Nov 2026 everything under `shared/` moved into `packages/` (see `docs/PACKAGES.md`). `moves.tsv` is every old path and its new one.

A branch started before the move can be brought over the same way main was:

    git merge main            # take the move; files you changed under shared/ come out as conflicts or as files left in shared/
    python3 tools/packages/rewrite.py tools/packages/moves.tsv --dry   # what it would change, and what it cannot work out
    python3 tools/packages/rewrite.py tools/packages/moves.tsv         # rewrite every reference, then git mv what is still in shared/

`rewrite.py` changes `shared/<path>` anywhere in the repo to the file's new path (a prefix that reaches the repo root is kept), and inside a
moved HTML, CSS, Markdown or Node file a relative path to its new place. A browser script's paths are left: they resolve against the page.
It lists what it could not resolve; most are comments, or the other folder named shared/ in library/tools/patch, which is not this one.
It skips anything a moves line names that is not there any more. `plan.py` is how `moves.tsv` was made.
