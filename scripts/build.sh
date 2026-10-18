#!/usr/bin/env bash
# Rebuild site/data from data/raw/ifta. Needs python3.
set -euo pipefail
cd "$(dirname "$0")/../pipeline"
python3 ifta_load.py
# site/data/sharh is written by make_sharh.py from the encyclopedia's data, so it is kept
mkdir -p ../site/data
find ../site/data -mindepth 1 -maxdepth 1 ! -name sharh -exec rm -rf {} +
python3 build_site.py
