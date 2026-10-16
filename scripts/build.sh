#!/usr/bin/env bash
# Rebuild site/data from data/raw/ifta. Needs python3.
set -euo pipefail
cd "$(dirname "$0")/../pipeline"
python3 ifta_load.py
rm -rf ../site/data
python3 build_site.py
