import json, urllib.request, time, math
def get(url):
    with urllib.request.urlopen(url, timeout=20) as r: return json.load(r)
now=int(time.time()*1000)
# 1s klines, last 6 hours
rows=[]
start=now-6*3600*1000
t=start
while t<now:
    d=get(f"https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1s&startTime={t}&limit=1000")
    if not d: break
    rows+=d; t=d[-1][0]+1000
json.dump(rows,open('b1s_6h.json','w'))
# 1m klines, last 7 days
rows=[]; t=now-7*86400*1000
while t<now:
    d=get(f"https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1m&startTime={t}&limit=1000")
    if not d: break
    rows+=d; t=d[-1][0]+60000
json.dump(rows,open('b1m_7d.json','w'))
print('ok')
