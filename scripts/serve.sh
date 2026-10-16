#!/usr/bin/env bash
# Serve the static site locally at http://localhost:8765
cd "$(dirname "$0")/../site" && exec python3 -m http.server "${PORT:-8765}"
