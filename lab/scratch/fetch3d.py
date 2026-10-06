import json, urllib.request, time
def get(url):
    for k in range(5):
        try:
            with urllib.request.urlopen(url, timeout=20) as r: return json.load(r)
        except Exception as e: time.sleep(2)
    raise SystemExit("fail")
now=int(time.time()*1000)//1000*1000
t=now-3*86400*1000; out=open('b1s_3d.csv','w'); n=0
while t<now:
    d=get(f"https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1s&startTime={t}&limit=1000")
    if not d: break
    for r in d: out.write(f"{r[0]//1000},{r[4]}\n")
    n+=len(d); t=d[-1][0]+1000
out.close(); print(n)
