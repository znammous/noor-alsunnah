#!/usr/bin/env bash
# Download the raw data into data/raw (about 1.3 GB zipped, 14 GB extracted).
#
# Main source: the Jami' Khadim al-Haramayn program (sunna.alifta.gov.sa) via the structured
# export by Jehad Oumer on Kaggle. Kaggle needs an API token:
#   KAGGLE_API_TOKEN=KGAT_... scripts/fetch_data.sh
set -euo pipefail
cd "$(dirname "$0")/.."
RAW=data/raw
: "${KAGGLE_API_TOKEN:?set KAGGLE_API_TOKEN to your Kaggle API token}"

mkdir -p $RAW/ifta
for d in ifta-hadith-corpus-original:original ifta-hadith-isnad-linked-graph-data:graph; do
  name=${d%%:*}; dir=${d##*:}
  if [ ! -s "$RAW/ifta/$dir/sahih-al-bukhari.json" ]; then
    curl -fL -H "Authorization: Bearer $KAGGLE_API_TOKEN" -o "$RAW/ifta/$name.zip" \
      "https://www.kaggle.com/api/v1/datasets/download/jehadoumer/$name"
    unzip -q -o "$RAW/ifta/$name.zip" -d "$RAW/ifta/$dir" && rm "$RAW/ifta/$name.zip"
  fi
done

echo "raw data ready in $RAW"
