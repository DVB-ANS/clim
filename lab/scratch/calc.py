import math, json, datetime
Y=365*86400
ZETA=1.4603545088095868  # |zeta(1/2)|
c_det=math.sqrt(math.pi)/ZETA
print("c_det = sqrt(pi)/|zeta(1/2)| =",round(c_det,5), " sqrt(2pi)/|zeta| =", round(math.sqrt(2*math.pi)/ZETA,5))
# --- reproduce MMR Table 1 (sigma 5% daily)
sd=0.05/math.sqrt(86400)
def Ptr(gam,sig_s,dt): return 1/(1+gam/(sig_s*math.sqrt(dt/2)))
print("MMR Table1 check:")
for dt,lab in [(600,'10min'),(120,'2min'),(12,'12s'),(2,'2s'),(0.05,'50ms')]:
    print(lab,[f"{100*Ptr(math.log(1+b/1e4),sd,dt):.1f}%" for b in [1,5,10,30,100]])
# --- DVOL
d=json.load(open('dvol_1y.json'))['result']['data']
mx=max(d,key=lambda x:x[2]); print("DVOL 1y max high",mx[2],"on",datetime.datetime.utcfromtimestamp(mx[0]/1000).date())
top=sorted(d,key=lambda x:-x[4])[:5]; print("top closes",[(str(datetime.datetime.utcfromtimestamp(x[0]/1000).date()),x[4]) for x in top])
sigmas={'RV6h 24%':0.24,'RV7d 37%':0.37,'DVOL 48%':0.48,'DVOL max 96%':0.96}
dts=[12,2,1,0.25]
print("\n=== sigma*sqrt(dt/2) in bp ===")
for k,s in sigmas.items():
    ss=s/math.sqrt(Y)
    print(f"{k:14s} sigma/sqrt(s)={ss*1e4:.3f}bp", " | ".join(f"dt={dt}s: {ss*math.sqrt(dt/2)*1e4:.2f}bp" for dt in dts))
print("\n=== f0 (bp) for target LP capture phi (Poisson: eta=phi/(1-phi); deterministic: eta=phi/((1-phi)c)) ===")
for phi in [0.5,0.75,0.9]:
    ep=phi/(1-phi); ed=ep/c_det
    print(f"phi={phi}: eta_Poisson={ep:.2f}, eta_det={ed:.2f}")
    for k,s in sigmas.items():
        ss=s/math.sqrt(Y)
        row=[]
        for dt in dts:
            u=ss*math.sqrt(dt/2)
            row.append(f"{dt}s: P {(math.exp(ep*u)-1)*1e4:5.2f} / D {(math.exp(ed*u)-1)*1e4:5.2f}")
        print("   ",f"{k:14s}"," | ".join(row))
print("\n=== incumbent fees: eta, Ptrade (Poisson), ARB/LVR det, LP share ===")
for k,s in [('DVOL 48%',0.48),('RV7d 37%',0.37),('DVOL max 96%',0.96)]:
    ss=s/math.sqrt(Y)
    for f in [1,5,30,100]:
        g=math.log(1+f/1e4); out=[]
        for dt in dts:
            eta=g/(ss*math.sqrt(dt/2)); P=1/(1+eta); Ad=1/(1+c_det*eta)
            out.append(f"{dt}s eta={eta:6.1f} Ptr={100*P:5.1f}% ARB/LVR_det={100*Ad:5.1f}%")
        print(k,f"fee {f}bp:"," | ".join(out))
