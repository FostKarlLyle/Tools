#!/usr/bin/env python3
"""Server dev statis untuk Saku — Asisten Kuliah AI.
   Cukup: python3 serve.py  →  buka http://localhost:8000"""
import http.server
import mimetypes

mimetypes.add_type('application/manifest+json', '.webmanifest')
mimetypes.add_type('text/javascript', '.js')


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # dev: selalu segar, jangan cache di browser
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        print('[saku] %s - %s' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    srv = http.server.ThreadingHTTPServer(('0.0.0.0', 8000), Handler)
    print('Saku dev server jalan di http://localhost:8000 (Ctrl+C untuk berhenti)')
    srv.serve_forever()
