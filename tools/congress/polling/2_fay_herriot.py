import pandas as pd, numpy as np, json, csv, math, sys
x=pd.read_pickle('long.pkl')
ppl=json.load(open('../../../server/congress/data/people.json',encoding='utf8'))
byid={p['id']:p for p in ppl}; ic={}
for r in csv.DictReader(open('../../../data/raw/HS119_members.csv',encoding='utf8')):
  if r['bioguide_id'] in byid and r['icpsr']: ic[str(int(float(r['icpsr'])))]=r['bioguide_id']
x['icpsr']=x.icpsr.astype(int).astype(str); x['mid']=x.icpsr.map(ic); x=x[x.mid.notna()]
x=x[x.apply(lambda r: byid[r.mid]['chamber']==r.seat and byid[r.mid].get('status')!='elect',axis=1)]
def _cur(m):
  p=byid[m]; return p['state'] if p['chamber']=='S' else f"{p['state']}-{int(p['district'] or 1):02d}"
x=x[x.apply(lambda r: (r.st if r.seat=='S' else r.cd)==_cur(r.mid),axis=1)]
x['ap']=(x.a.str.contains('Approve')&~x.a.str.contains('Disapprove')).astype(float)
x['dis']=x.a.str.contains('Disapprove').astype(float)
mp=x.mid.map(lambda m: byid[m]['party'] if byid[m]['party'] in 'DR' else ('D' if byid[m].get('caucus')=='D' or byid[m]['party']=='I' else 'R'))
x['same']=((x.pid==1.0)&(mp=='D'))|((x.pid==2.0)&(mp=='R'))
x['opp']=((x.pid==2.0)&(mp=='D'))|((x.pid==1.0)&(mp=='R'))
def direct(g,col):
  w=g.w.values; W=w.sum(); y=(w*g[col].values).sum()/W
  neff=W*W/(w*w).sum(); return y, y*(1-y)/neff, neff
def build(xx):
  rows=[]
  for m,g in xx.groupby('mid'):
    W=g.w.sum(); r=dict(mid=m, ch=byid[m]['chamber'], same=(g.w*g.same).sum()/W, opp=(g.w*g.opp).sum()/W, n=len(g))
    for c in ('ap','dis'):
      y,v,ne=direct(g,c); r[c]=y; r['v_'+c]=max(v,0.25/ max(ne,1)*0.2); r['neff']=ne
    rows.append(r)
  return pd.DataFrame(rows)
def fh(df,c):
  X=np.column_stack([np.ones(len(df)), df.same, df.opp, (df.ch=='S').astype(float), df.same*(df.ch=='S')])
  y=df[c].values; v=df['v_'+c].values
  s2=0.002
  for _ in range(200):  # Fay-Herriot REML-ish fixed point (Fay-Herriot moment estimator)
    W=1/(s2+v); B=np.linalg.solve(X.T@(X*W[:,None]), X.T@(W*y)); res=y-X@B
    s2n=max(1e-5, (np.sum(W*res**2)-(len(y)-X.shape[1]))/np.sum(W)+s2 ) if False else None
    # moment: sum((res^2)/(s2+v)) = m-p
    lo,hi=1e-6,0.2
    for _ in range(60):
      mid=(lo+hi)/2; Wm=1/(mid+v); Bm=np.linalg.solve(X.T@(X*Wm[:,None]), X.T@(Wm*y)); f=np.sum((y-X@Bm)**2*Wm)-(len(y)-X.shape[1])
      lo,hi=(mid,hi) if f>0 else (lo,mid)
    s2=(lo+hi)/2; break
  W=1/(s2+v); B=np.linalg.solve(X.T@(X*W[:,None]), X.T@(W*y))
  g=s2/(s2+v); est=g*y+(1-g)*(X@B); mse=g*v
  return est, np.sqrt(mse), s2, B
if __name__=='__main__':
  df=build(x)
  for c in ('ap','dis'):
    e,se,s2,B=fh(df,c); df['fh_'+c]=e; df['se_'+c]=se
    print(c,'sigma_u',round(math.sqrt(s2),3),'beta',np.round(B,3))
  df['moe']=1.96*np.maximum(df.se_ap,df.se_dis)*100
  print(df.groupby('ch').moe.describe())
  # validation: big-sample members, subsample 150 respondents
  big=[m for m,g in x.groupby('mid') if len(g)>=1500 and byid[m]['chamber']=='S']
  rng=np.random.default_rng(1); ed=[];ef=[]
  for rep in range(5):
    parts=[]
    for m,g in x.groupby('mid'):
      parts.append(g.sample(n=min(len(g),150),random_state=int(rng.integers(1e9))) if m in big else g)
    sub=build(pd.concat(parts)); e,_,_,_=fh(sub,'ap'); sub['fh']=e
    t=df.set_index('mid').ap
    s=sub[sub.mid.isin(big)]
    ed+=list((s.ap-s.mid.map(t)).abs()); ef+=list((s.fh-s.mid.map(t)).abs())
  print('validation on',len(big),'senators x5: mean abs err direct',round(np.mean(ed)*100,2),'FH',round(np.mean(ef)*100,2))
  df.to_pickle('fh.pkl')
