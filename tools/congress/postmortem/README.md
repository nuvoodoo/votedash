# 2026 post-mortem (/2026-post-mortem)

`node tools/congress/postmortem/build.js` writes `server/congress/data/postmortem.json` from:

- `data/raw/snapshot.json`: 2026 House and Senate results (the frozen election-night feed)
- FEC 2026 bulk files in `data/raw`: `cn.txt`, `cm.txt`, `weball26.txt`, `itpas2.txt` (contributions and independent expenditures)
- the built `people`, `rollcalls`, `bills`, `caucuses`, `industries` and `funders` data
- `tools/congress/static/ballot-2026.json` (statewide measures, made by `ballot.py` from Ballotpedia's
  2026 ballot measures tables; labels and issue groups are ours) and `ballot-2026-money.json`

Run it after `build.js` whenever the FEC files are refreshed. The nightly rebuild carries the bundled
`postmortem.json` over unchanged.
