#!/usr/bin/env python3
"""Serves this checkout of thelastfleet.com on the LAN so Kyle can look at the wiki before it goes live.

    python3 tools/preview_wiki.py                 # http://<this Mac>:8771/wiki/
    python3 tools/preview_wiki.py --port 8771 --also ~/Projects/thelastfleet-site-world

A path that is not in this checkout is looked up in the --also checkout(s), so the wiki's links to the
Runners lore wiki (runners/wiki/, still on its own branch) work in the preview. Read only; GET and HEAD only.
"""
import argparse, functools, http.server, os, posixpath, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    roots = [ROOT]

    def translate_path(self, path):
        path = posixpath.normpath(urllib.parse.unquote(urllib.parse.urlsplit(path).path))
        parts = [p for p in path.split('/') if p and p not in ('.', '..')]
        first = None
        for r in self.roots:
            full = os.path.join(r, *parts)
            if first is None: first = full
            if os.path.exists(full): return full
        return first

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=8771); ap.add_argument('--bind', default='0.0.0.0')
    ap.add_argument('--also', action='append', default=[os.path.expanduser('~/Projects/thelastfleet-site-world')])
    a = ap.parse_args()
    Handler.roots = [ROOT] + [os.path.realpath(os.path.expanduser(x)) for x in a.also if os.path.isdir(os.path.expanduser(x))]
    print('Serving %s (then %s) on port %d' % (ROOT, ', '.join(Handler.roots[1:]) or 'nothing else', a.port), flush=True)
    http.server.ThreadingHTTPServer.request_queue_size = 128
    http.server.ThreadingHTTPServer.daemon_threads = True
    http.server.ThreadingHTTPServer((a.bind, a.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
