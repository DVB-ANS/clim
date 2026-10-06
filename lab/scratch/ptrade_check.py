import math, sys
from bt2 import load
Y=365*86400; BP=1e-4
def run(fn,label,dt=12,Pstar=0.10,W=900,REP=30,LAT=12,fmin=5,fmax=150,win=300):
    t0,X=load(fn); n=len(X)
    eta=1/Pstar-0.824
    rv={}
    for t in range(W,n,REP):
        r=[X[t-W+60*(i+1)]-X[t-W+60*i] for i in range(W//60)]
        rv[t]=math.sqrt(sum(x*x for x in r)/W)  # per sqrt s
    def rep(t):
        k=(t-LAT-W)//REP; return W+k*REP
    blocks=list(range(W+REP+LAT,n,dt))
    p=X[blocks[0]]; ntr=0; N=0; fsum=0; floor=0; ex=[]; pred=[]
    for t in blocks:
        s=rv[rep(t)]; f=eta*s*math.sqrt(dt/2); 
        fc=min(fmax*BP,max(fmin*BP,f)); floor+= (fc!=f)
        g=math.log(1+fc)
        z=X[t]-p; N+=1; fsum+=fc
        e=0
        if abs(z)>g: ntr+=1; e=1; p=X[t]-math.copysign(g,z)
        ex.append(e); pred.append(1/(g/(s*math.sqrt(dt/2))+0.824) if s>0 else 0)
    ph=ntr/N; pp=sum(pred)/N
    # Kupiec / Basel zones on windows of `win` blocks with p = predicted mean in window
    from math import comb, log
    def cdf(x,n,p):
        return sum(comb(n,k)*p**k*(1-p)**(n-k) for k in range(x+1))
    zones={'vert':0,'orange':0,'rouge':0}; ratios=[]
    for i in range(0,len(ex)-win+1,win):
        x=sum(ex[i:i+win]); pw=sum(pred[i:i+win])/win
        c=cdf(x,win,pw)
        zones['vert' if c<0.95 else ('orange' if c<0.9999 else 'rouge')]+=1
        if x>0:
            ph_w=x/win; ratios.append((1/pw-0.824)/(1/ph_w-0.824) if ph_w<1/0.824 else float('nan'))
    sar=(1/pp-0.824)/(1/ph-0.824)
    print(f"{label}: blocks={N} fee moy={fsum/N/BP:.1f}bp (plancher/plafond actifs {100*floor/N:.0f}%) P_trade obs={ph:.3f} pred(det)={pp:.3f} ratio={ph/pp:.2f} sigma_arb/sigma_hat={sar:.2f}; zones Bâle sur fenêtres de {win} blocs: {zones}; mediane ratio fenetre={sorted(ratios)[len(ratios)//2]:.2f}")
for fn,lab in [('b1s_feb.csv','fev-2026'),('b1s_3d.csv','oct-2026')]:
    for P in [0.10,0.20]:
        run(fn,f"{lab} P*={P}",Pstar=P)
