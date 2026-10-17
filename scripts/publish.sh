#!/usr/bin/env bash
# Publish site/ to the gh-pages branch (served by GitHub Pages). Commit your changes on main first.
set -euo pipefail
cd "$(dirname "$0")/.."
# new asset/data URLs on every publish, so browsers never mix cached and fresh files
python3 scripts/stamp.py >/dev/null
if ! git diff --quiet -- site/app.html site/index.html; then
  git add site/app.html site/index.html
  git commit -qm "رقم إصدار الموقع"
fi
git push origin main
git branch -D gh-pages >/dev/null 2>&1 || true
git subtree split --prefix site -b gh-pages
git push -f origin gh-pages
