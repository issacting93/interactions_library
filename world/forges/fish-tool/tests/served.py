"""Run one of these tests without a local server: the pages are served to the browser straight from the repo's files.
  python3 world/forges/fish-tool/tests/served.py audit.py [args]
  ENGINE=js python3 world/forges/fish-tool/tests/served.py maw-sim.py 4 60     (the same with the Rust engine off)
Every page the test opens answers http://localhost:8731/... from the repo, as `python3 -m http.server 8731` at the root would."""
import os, sys, runpy, mimetypes, urllib.parse
from playwright.sync_api import Browser, BrowserContext, Route
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
ENGINE = os.environ.get("ENGINE")
def serve(route):
    path = os.path.normpath(os.path.join(ROOT, urllib.parse.unquote(urllib.parse.urlparse(route.request.url).path).lstrip("/")))
    if os.path.isdir(path): path = os.path.join(path, "index.html")
    if not path.startswith(ROOT) or not os.path.isfile(path): return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type=mimetypes.guess_type(path)[0] or "application/octet-stream", body=open(path, "rb").read())
def wrap(cls):
    new = cls.new_page
    def new_page(self, *a, **k):
        pg = new(self, *a, **k); pg.route("http://localhost:8731/**", serve)
        if ENGINE: pg.add_init_script(f"window.ECO_ENGINE = {ENGINE!r};")
        return pg
    cls.new_page = new_page
wrap(Browser); wrap(BrowserContext)
# a test's own route that lets a request through would send it to the server that is not there: serve it instead
_go = Route.continue_
def continue_(self, *a, **k):
    if self.request.url.startswith("http://localhost:8731/"): return serve(self)
    return _go(self, *a, **k)
Route.continue_ = continue_
script = os.path.join(os.path.dirname(__file__), sys.argv[1]); sys.argv = [script] + sys.argv[2:]
runpy.run_path(script, run_name="__main__")
