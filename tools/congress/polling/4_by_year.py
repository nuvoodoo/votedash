# Approval year by year (Russ, 2026-11-20: "For polling on candidates, show the past 7 years").
# Run from this folder after 3_write.py:  python 4_by_year.py path/to/cum.feather
# The same Fay-Herriot model as 2_fay_herriot.py, fitted to each survey year on its own (2019-2025),
# for the member's current seat only. Adds byYear (newest first) to server/congress/data/approval.json,
# keeping years with a margin of error of 10 points or less. Writes long.pkl here; it is deleted after.
import os, sys, json
import pyarrow.feather as f, pandas as pd

YEARS = list(range(2019, 2026))
cols = ['year', 'weight', 'st', 'cd', 'approval_rep', 'approval_sen1', 'approval_sen2', 'rep_icpsr', 'sen1_icpsr',
        'sen2_icpsr', 'rep_current', 'sen1_current', 'sen2_current', 'pid3']
d = f.read_table(sys.argv[1], columns=cols).to_pandas()
d = d[d.year.isin(YEARS)]
rows = []
for k in ['rep', 'sen1', 'sen2']:
    x = d[['year', 'weight', 'st', 'cd', 'pid3', f'approval_{k}', f'{k}_icpsr', f'{k}_current']].copy()
    x.columns = ['year', 'w', 'st', 'cd', 'pid', 'a', 'icpsr', 'name']
    x['seat'] = 'H' if k == 'rep' else 'S'
    rows.append(x)
x = pd.concat(rows)
x = x[x.icpsr.notna() & x.a.notna()]
x['a'] = x.a.astype(str)
x.to_pickle('long.pkl')
try:
    fhm = __import__('2_fay_herriot')
finally:
    os.remove('long.pkl')
x = fhm.x

out = {}
for yr in YEARS:
    df = fhm.build(x[x.year == yr])
    for c in ('ap', 'dis'):
        e, se, _, _ = fhm.fh(df, c)
        df['fh_' + c] = e
        df['se_' + c] = se
    df['moe'] = 1.96 * df[['se_ap', 'se_dis']].max(axis=1) * 100
    kept = 0
    for r in df.itertuples():
        if r.moe > 10:
            continue
        ap, di = round(r.fh_ap * 100), round(r.fh_dis * 100)
        out.setdefault(r.mid, []).append(dict(year=yr, approve=ap, disapprove=di, unsure=max(0, 100 - ap - di),
                                              moe=round(r.moe), n=int(r.n)))
        kept += 1
    print(yr, 'members', len(df), 'kept', kept)

path = '../../../server/congress/data/approval.json'
A = json.load(open(path, encoding='utf8'))
for mid, ys in out.items():
    if mid in A['members'] and len(ys) > 1:
        A['members'][mid]['byYear'] = sorted(ys, key=lambda r: -r['year'])
A['byYearYears'] = YEARS
print('members with a year-by-year trend', sum(1 for m in A['members'].values() if 'byYear' in m), 'of', len(A['members']))
print('S000148', A['members']['S000148'].get('byYear'))
json.dump(A, open(path, 'w'), separators=(',', ':'))
