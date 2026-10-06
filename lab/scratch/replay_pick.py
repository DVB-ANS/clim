import math, datetime as dt
from bt2 import load
Y=365*86400; BP=1e-4
t0,X=load('b1s_feb.csv'); n=len(X)
# RV per hour (1-min returns), annualized
H=3600
rvh=[]
for h in range(n//H):
    a=h*H; r=[X[a+60*(i+1)]-X[a+60*i] for i in range(59)]
    rvh.append(math.sqrt(sum(x*x for x in r)/(59*60)*Y))
best=max(range(1,len(rvh)), key=lambda h: rvh[h]-rvh[h-1])
top=max(range(len(rvh)), key=lambda h: rvh[h])
f=lambda h: dt.datetime.utcfromtimestamp(t0+h*H).strftime('%Y-%m-%d %H:%M UTC')
print("RV horaire min/med/max:", round(min(rvh)*100), round(sorted(rvh)[len(rvh)//2]*100), round(max(rvh)*100))
print("plus forte hausse h->h+1:", f(best-1), round(rvh[best-1]*100), '->', round(rvh[best]*100))
print("heure la plus volatile:", f(top), round(rvh[top]*100))
# simulate 2h window [best-1, best+1): static vs dynamic at equal mean fee, P*=10%, dt=12
def sim(a,b,dtb=12,Pstar=0.10,W=900,REP=30,LAT=12,fmin=5,fmax=150):
    eta=1/Pstar-0.824
    def rv(t):
        r=[X[t-W+60*(i+1)]-X[t-W+60*i] for i in range(W//60)]; return math.sqrt(sum(x*x for x in r)/W)
    blocks=list(range(a,b,dtb))
    fees=[]
    for t in blocks:
        to=((t-LAT)//REP)*REP; s=rv(to); fees.append(min(fmax*BP,max(fmin*BP,eta*s*math.sqrt(dtb/2))))
    fbar=sum(fees)/len(fees)
    out={}
    for name,fl in [('static',[fbar]*len(blocks)),('dyn',fees)]:
        p=X[blocks[0]]; ARB=FEE=0; ntr=0; LVR=0; prev=p
        for t,fe in zip(blocks,fl):
            x=X[t]; LVR+=0.5*(x-prev)**2; prev=x; g=math.log(1+fe); z=x-p
            if abs(z)>g: d=abs(z)-g; ARB+=0.5*d*d; FEE+=g*d; ntr+=1; p=x-math.copysign(g,z)
        out[name]=(ARB,FEE,ntr/len(blocks),LVR)
    print(f"fenetre {f(a//H) if a%H==0 else a} 2h: frais dyn moyen {fbar/BP:.1f} bp (min {min(fees)/BP:.1f}, max {max(fees)/BP:.1f}); "
          f"static: ARB/LVR {out['static'][0]/out['static'][3]:.3f} Ptr {out['static'][2]:.3f} | dyn: ARB/LVR {out['dyn'][0]/out['dyn'][3]:.3f} Ptr {out['dyn'][2]:.3f} | ARB dyn/static {out['dyn'][0]/out['static'][0]-1:+.1%}")
sim((best-1)*H,(best+1)*H)
sim((best-2)*H,(best+2)*H)
