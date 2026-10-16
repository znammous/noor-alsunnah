#!/usr/bin/env bash
# Download the raw open datasets into data/raw (about 1.6 GB, mostly the knowledge graph).
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=data/raw

mkdir -p $RAW/hadith-kg $RAW/hadithdb $RAW/mids

# «الجامع» Hadith Knowledge Graph — CC BY 4.0
[ -s $RAW/hadith-kg/hadith-kg.db ] || curl -fL -o $RAW/hadith-kg/hadith-kg.db \
  "https://huggingface.co/datasets/emadjumaah/hadith-kg/resolve/main/hadith-kg.db"

# hatemben/hadithdb — Sahih al-Bukhari with kitab/bab and Fath al-Bari numbering
for f in bukhari_sultania_copy.json narrators_db.json; do
  [ -s $RAW/hadithdb/$f ] || curl -fL -o $RAW/hadithdb/$f "https://raw.githubusercontent.com/hatemben/hadithdb/master/$f"
done

# MIDS (Multi-IsnadSet) — Sahih Muslim with kitab/bab — CC BY 4.0
M=https://data.mendeley.com/public-files/datasets/gzprcr93zn/files
[ -s $RAW/mids/content.xlsx ] || curl -fL -o $RAW/mids/content.xlsx $M/4a4650f1-b6d5-4cbd-892a-cc469bdea323/file_downloaded
[ -s $RAW/mids/nodes.xlsx ]   || curl -fL -o $RAW/mids/nodes.xlsx   $M/8408bd32-e725-44fd-b427-c2cd6ef03ac9/file_downloaded
[ -s $RAW/mids/edges.xlsx ]   || curl -fL -o $RAW/mids/edges.xlsx   $M/fed5b7e8-760c-49a2-9cb4-81e8c8079521/file_downloaded

echo "raw data ready in $RAW"
