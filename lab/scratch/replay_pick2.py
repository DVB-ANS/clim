import math, datetime as dt
from bt2 import load
exec(open('replay_pick.py').read().split("best=max")[0])
s=" ".join(f"{dt.datetime.utcfromtimestamp(t0+h*H).strftime('%d/%Hh')}:{round(rvh[h]*100)}" for h in range(len(rvh)))
print(s)
