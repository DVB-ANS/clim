import json, math, statistics as st
Y=365*86400
s=json.load(open('b1s_6h.json'))
# build 1s close series (fill gaps forward)
ts=[r[0]//1000 for r in s]; cl=[float(r[4]) for r in s]
d=dict(zip(ts,cl)); t0,t1=min(ts),max(ts)
ser=[];last=None
for t in range(t0,t1+1):
    if t in d: last=d[t]
    ser.append(last)
lp=[math.log(x) for x in ser]
print('1s series length',len(lp),'hours',len(lp)/3600, 'missing seconds', (t1-t0+1)-len(ts))
for h in [1,2,4,12,60,300]:
    r=[lp[i+h]-lp[i] for i in range(0,len(lp)-h,h)]
    rv=sum(x*x for x in r)/len(r)/h  # variance per second
    print(f"h={h:4d}s  sigma_ann={math.sqrt(rv*Y)*100:6.1f}%  sd per step={math.sqrt(rv*h)*1e4:6.2f} bp  kurt={st.mean([x**4 for x in r])/(st.mean([x*x for x in r])**2):6.1f}")
m=json.load(open('b1m_7d.json'))
lp=[math.log(float(r[4])) for r in m]
for h in [1,5,15,60]:
    r=[lp[i+h]-lp[i] for i in range(0,len(lp)-h,h)]
    rv=sum(x*x for x in r)/len(r)/(60*h)
    print(f"7d h={h}min sigma_ann={math.sqrt(rv*Y)*100:6.1f}%")
# rolling 1h RV from 1m for last 7 days: max/min
r1=[lp[i+1]-lp[i] for i in range(len(lp)-1)]
rv1h=[math.sqrt(sum(x*x for x in r1[i:i+60])/3600*Y)*100 for i in range(0,len(r1)-60,60)]
print('rolling 1h RV (1m) over 7d: min %.1f median %.1f max %.1f'%(min(rv1h),st.median(rv1h),max(rv1h)))
