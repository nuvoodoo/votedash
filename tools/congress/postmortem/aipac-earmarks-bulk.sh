#!/bin/sh
# Extracts contributions earmarked through AIPAC PAC (FEC C00797670) from the FEC 2025-26 individual
# contributions bulk file into data/raw/aipac-earmarks.txt (same pipe-delimited columns as itcont.txt).
# Download first: https://www.fec.gov/files/bulk-downloads/2026/indiv26.zip -> data/raw/indiv26-dl/indiv26.zip
cd "$(dirname "$0")/../../.." || exit 1
unzip -p data/raw/indiv26-dl/indiv26.zip itcont.txt | awk -F'|' '$16 == "C00797670"' > data/raw/aipac-earmarks.txt
wc -l data/raw/aipac-earmarks.txt
