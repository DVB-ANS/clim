exec(open('replay_pick.py').read().split("best=max")[0])
src=open('replay_pick.py').read()
exec("def sim"+src.split("def sim")[1].split("sim((best")[0])
import calendar, datetime as dt
f=lambda h: dt.datetime.utcfromtimestamp(t0+h*H).strftime("%Y-%m-%d %H:%M UTC")
def at(d,h): return (calendar.timegm((2026,2,d,h,0,0))-t0)
for (d,h,k) in [(3,12,3),(4,12,4),(4,11,4)]:
    a=at(d,h); print(d,h,k,end=' '); sim(a,a+k*H)
