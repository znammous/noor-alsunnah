#!/usr/bin/env bash
# Publish site/ to the gh-pages branch (served by GitHub Pages). Commit your changes on main first.
set -euo pipefail
cd "$(dirname "$0")/.."
git push origin main
git branch -D gh-pages >/dev/null 2>&1 || true
git subtree split --prefix site -b gh-pages
git push -f origin gh-pages
