import pandas as pd, numpy as np, json
from importlib import import_module as _im
_fh=_im("2_fay_herriot"); x,byid=_fh.x,_fh.byid
# x, byid
df=pd.read_pickle('fh.pkl')
raw=json.load(open('raw.json'))
out={}
for r in df.itertuples():
  if r.moe>10: continue
  ap=round(r.fh_ap*100); di=round(r.fh_dis*100); un=max(0,100-ap-di)
  g=x[x.mid==r.mid]
  e=dict(approve=ap,disapprove=di,unsure=un,moe=round(r.moe),n=int(r.n),years=sorted(int(y) for y in g.year.unique()),place=(g.st.iloc[0] if r.ch=='S' else g.cd.iloc[0]))
  if r.ch=='S':
    bp={}
    for k,lab in [(1.0,'D'),(2.0,'R'),(3.0,'I')]:
      s=g[g.pid==k]
      if len(s)>=100: bp[lab]=round((s.w*s.ap).sum()/s.w.sum()*100)
    if len(bp)==3: e['byParty']=bp
  out[r.mid]=e
print(len(out), sum(1 for k in out if byid[k]['chamber']=='H'), sum(1 for k in out if byid[k]['chamber']=='S'))
print(out['S000148'], out.get('J000294'), out.get('J000299'))
json.dump(dict(source='Cooperative Election Study',url='https://cces.gov.harvard.edu/',years=[2024,2025],members=out),open('../../../server/congress/data/approval.json','w'),separators=(',',':'))
