# Primary results for House and Senate, 2012-2022, from the FEC's "Federal Elections"
# publications (data/raw/fe2012.xls ... fe2022.xlsx). Writes data/raw/primaries-fec.json:
# [{y, ch, st, d, pt, c: [{f, n, p, v, pc, u, rv, rpc, w}]}]
#   pt = 'D' | 'R' | 'T2' (top-two / all-party primary); u = unopposed; rv/rpc = primary runoff.
import json, re, sys, openpyxl, xlrd

terr = {}
TOP2 = {'CA': 2012, 'WA': 2012, 'AK': 2022}
DEM = {'D', 'DEM', 'DFL', 'DNL', 'D/WF', 'D/IP', 'D/R', 'DCG'}
REP = {'R', 'REP', 'R/TRP', 'R/D', 'R/IP', 'GOP'}

def sheets(y):
    if y <= 2014:
        b = xlrd.open_workbook(f'data/raw/fe{y}.xls')
        return [(s.name, [s.row_values(i) for i in range(s.nrows)]) for s in b.sheets()]
    b = openpyxl.load_workbook(f'data/raw/fe{y}.xlsx', read_only=True)
    return [(n, [list(r) for r in b[n].iter_rows(values_only=True)]) for n in b.sheetnames]

def num(x):
    if isinstance(x, (int, float)) and x != '': return float(x)
    if isinstance(x, str):
        s = x.replace(',', '').strip()
        if re.fullmatch(r'\d+(\.\d+)?', s): return float(s)
    return None

races = {}
for y in (2012, 2014, 2016, 2018, 2020, 2022):
    for name, rows in sheets(y):
        if not re.search(r'(House|Senate).*(Result|Resuts)', name): continue
        hi = next(i for i, r in enumerate(rows[:8]) if any(isinstance(c, str) and 'FEC ID' in c for c in r))
        h = [str(c or '').strip().upper() for c in rows[hi]]
        col = lambda *ks: next((i for i, c in enumerate(h) if any(c == k or c.startswith(k) for k in ks)), None)
        cST, cD, cF, cFi, cLa, cP = col('STATE ABBREVIATION'), col('DISTRICT', 'D'), col('FEC ID'), col('CANDIDATE NAME (FIRST)'), col('CANDIDATE NAME (LAST)'), col('PARTY')
        cPV, cPP, cRV, cRP, cPW = col('PRIMARY VOTES'), col('PRIMARY %'), col('RUNOFF VOTES'), col('RUNOFF %'), col('PE WINNER')
        cGV, cGP, cGW = col('GENERAL VOTES'), col('GENERAL %'), col('GE WINNER')
        section = ''
        for r in rows[hi + 1:]:
            r = list(r) + [None] * 40
            st = (r[cST] or '').strip() if isinstance(r[cST], str) else ''
            fec = str(r[cF] or '').strip()
            if len(st) != 2: continue
            if not re.fullmatch(r'[HS]\d[A-Z]{2}\w+', fec):
                lab = str(r[cFi + 2] or '').strip() if cFi is not None else ''
                if lab and not lab.endswith(':') and not lab.lower().startswith(('scatter', 'total', 'none of', 'blank', 'over', 'under', 'write')): section = lab
                continue
            d = str(r[cD] or '').strip()
            ch = 'S' if ('Senate' in name and 'House' not in name) or d.upper().startswith('S') else 'H'
            dist = None if ch == 'S' else (int(float(d)) if re.fullmatch(r'\d+(\.0)?', d) else 0)
            party = str(r[cP] or '').strip().upper()
            if num(r[cGV]) is not None:
                g = terr.setdefault((y, ch, st, dist, (section + ' ' + d) if ch == 'S' else ''), {})
                gv, gp, gw = int(num(r[cGV])), num(r[cGP]) or 0, str(r[cGW] or '').strip().upper() == 'W'
                if fec in g: g[fec]['v'] += gv; g[fec]['pc'] = round(g[fec]['pc'] + gp, 4); g[fec]['w'] = g[fec]['w'] or gw; g[fec]['p'] = 'D' if party in DEM else 'R' if party in REP else g[fec]['p']  # fusion: one row per party line
                else: g[fec] = {'f': fec, 'n': (str(r[cFi] or '').strip() + ' ' + str(r[cLa] or '').strip()).strip(), 'p': 'D' if party in DEM else 'R' if party in REP else party, 'v': gv, 'pc': round(gp, 4), 'w': gw}
            pv, raw = num(r[cPV]), r[cPV]
            unopp = isinstance(raw, str) and 'unopposed' in raw.lower()
            if pv is None and not unopp: continue
            if st == 'LA': continue
            pt = 'T2' if st in TOP2 and y >= TOP2[st] else 'D' if party in DEM or party.startswith('DEM') else 'R' if party in REP or party.startswith('REP') else None
            if not pt: continue
            # FEC lists a seat's regular and special Senate races under separate section labels
            k = (y, ch, st, dist, (section + ' ' + d) if ch == 'S' else '', pt)
            first, last = str(r[cFi] or '').strip(), str(r[cLa] or '').strip()
            n = (first + ' ' + last).strip()
            cand = {'f': fec, 'n': n, 'p': party[:1] if pt == 'T2' else pt, 'v': int(pv) if pv is not None else None, 'pc': round(float(r[cPP]), 4) if num(r[cPP]) is not None else None, 'u': unopp or None,
                    'rv': int(num(r[cRV])) if cRV is not None and num(r[cRV]) is not None else None, 'rpc': round(num(r[cRP]), 4) if cRP is not None and num(r[cRP]) is not None else None,
                    'pw': (str(r[cPW] or '').strip().upper() == 'W') if cPW is not None else None}
            race = races.setdefault(k, {})
            if fec in race: continue
            race[fec] = cand

out = []
for (y, ch, st, d, sec, pt), cs in races.items():
    c = list(cs.values())
    special = bool(re.search(r'unexpired|special', sec, re.I))
    if any(x['rv'] for x in c):
        top = max((x for x in c if x['rv']), key=lambda x: x['rv'])
        for x in c: x['w'] = x is top
    elif any(x['pw'] is not None for x in c) and any(x['pw'] for x in c):
        for x in c: x['w'] = bool(x['pw'])
    else:
        ranked = sorted(c, key=lambda x: -(x['v'] or 0))
        adv = 2 if pt == 'T2' else 1
        for i, x in enumerate(ranked): x['w'] = bool(i < adv and (x['v'] or x['u'])) or len(c) == 1
    for x in c: x.pop('pw', None); [x.pop(k) for k in [k for k, v in list(x.items()) if v is None]]
    c.sort(key=lambda x: -((x.get('rv') or 0) * 1e9 + (x.get('v') or 0)))
    out.append({'y': y, 'ch': ch, 'st': st, 'd': d, 'pt': pt, **({'sp': True} if special else {}), 'src': 'fec', 'c': c})
json.dump(out, open('data/raw/primaries-fec.json', 'w'), separators=(',', ':'))
json.dump([{'y': y, 'ch': ch, 'st': st, 'd': d, **({'sp': True} if re.search(r'unexpired|special', sk, re.I) else {}), 'c': sorted(g.values(), key=lambda x: -x['v'])} for (y, ch, st, d, sk), g in terr.items()], open('data/raw/generals-fec.json', 'w'), separators=(',', ':'))
print(len(terr), 'general races,', len(out), 'races', sum(len(r['c']) for r in out), 'candidates')
