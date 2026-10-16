#!/usr/bin/env bash
# Rebuild site/data from data/raw. Needs python3 with pandas + openpyxl.
set -euo pipefail
cd "$(dirname "$0")/../pipeline"
python3 load_bukhari.py
python3 load_muslim.py
python3 kg_load.py
rm -rf ../site/data
python3 build_site.py
