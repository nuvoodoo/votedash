# Primaries, special elections and FEC general results

Builds `tools/congress/static/elections-extra.json`, which `build.js` reads (locally and in the nightly rebuild).

1. `python tools/congress/primaries/fec.py` reads the FEC "Federal Elections" workbooks in `data/raw`
   (`fe2012.xls`, `fe2014.xls`, `fe2016.xlsx` … `fe2022.xlsx`, from
   `https://www.fec.gov/resources/cms-content/documents/federalelectionsYYYY.xls[x]`) and writes
   `data/raw/primaries-fec.json` (party and top-two primaries, with runoffs) and
   `data/raw/generals-fec.json` (general results, used where the MEDSL files lack a race).
   Needs `openpyxl` and `xlrd`.
2. `node tools/congress/primaries/civic.js` pulls 2024–2026 primaries and 2025–2026 special elections
   from civicAPI and merges everything into `static/elections-extra.json`.

Members are matched to FEC rows by FEC candidate ID, and to civicAPI rows by name within the state.
When the FEC publishes Federal Elections 2024, add `fe2024.xlsx` to the year list in `fec.py`.
