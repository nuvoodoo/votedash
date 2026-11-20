import pyarrow.feather as f, pandas as pd, json
cols=['year','weight','st','cd','approval_rep','approval_sen1','approval_sen2','rep_icpsr','sen1_icpsr','sen2_icpsr','rep_current','sen1_current','sen2_current','pid3']
d=f.read_table('cum.feather',columns=cols).to_pandas()
d=d[d.year.isin([2024,2025])]
print(d.approval_rep.astype(str).value_counts().to_dict())
print(d.pid3.astype(str).value_counts().to_dict())
rows=[]
for k in ['rep','sen1','sen2']:
  x=d[['year','weight','st','cd','pid3',f'approval_{k}',f'{k}_icpsr',f'{k}_current']].copy()
  x.columns=['year','w','st','cd','pid','a','icpsr','name']; x['seat']='H' if k=='rep' else 'S'
  rows.append(x)
x=pd.concat(rows); x=x[x.icpsr.notna() & x.a.notna()]
x['a']=x.a.astype(str)
x.to_pickle('long.pkl'); print(len(x)); print(x.head())
