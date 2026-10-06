import math, json, sys, bisect
Y=365*86400; BP=1e-4
def load(fn):
    d={}
    for line in open(fn):
        t,c=line.split(','); d[int(t)]=math.log(float(c))
    t0,t1=min(d),max(d); X=[];last=None
    for t in range(t0,t1+1):
        if t in d: last=d[t]
        X.append(last)
    return t0,X
def dvol_series(fn,t0,n):
    pts=json.load(open(fn)); ts=[p[0]//1000 for p in pts]; v=[p[4]/100 for p in pts]
    out=[]
    for i in range(0,n):
        j=bisect.bisect_right(ts,t0+i-60)-1  # last closed candle, lag 60s
        out.append(v[max(j,0)])
    return out
def run(fn,dvolfn,dt,fs,label):
    t0,X=load(fn); n=len(X)
    iv=dvol_series(dvolfn,t0,n)
    # CRE reports every 30s: obs at k*30, effective at +12s. RV: trailing 15min of 1-min returns
    REP=30; LAT=12; W=900
    rep_t=list(range(W,n,REP))
    rv={}; 
    for t in rep_t:
        r=[X[t-W+60*(i+1)]-X[t-W+60*i] for i in range(W//60)]
        rv[t]=math.sqrt(sum(x*x for x in r)/W*Y)
    def report_at(t):  # latest report effective at time t
        k=(t-LAT-W)//REP
        if k<0: return None
        to=W+k*REP; return to
    blocks=list(range(W+REP+LAT,n,dt))
    # sigma_hat per block for policies
    def sig(pol,t):
        to=report_at(t)
        if pol=='RV': return rv[to]
        if pol=='IV': return iv[to]
        if pol=='MAX': return max(rv[to],iv[to])
    # calibrate eta so that time-average fee = fs
    res={}
    for pol in ['STATIC','RV','IV','MAX']:
        if pol=='STATIC': eta=None
        else:
            mean_u=sum(sig(pol,t)/math.sqrt(Y)*math.sqrt(dt/2) for t in blocks)/len(blocks)
            eta=fs*BP/mean_u
        res[pol]=eta
    out=[]
    for name,pol,toll in [('STATIC','STATIC',None),('DYN_RV','RV',None),('DYN_IV','IV',None),('DYN_MAX','MAX',None),
                          ('RV+deadband single','RV','dead1'),('RV+deadband split','RV','deadS'),('RV+bayes split','RV','bayesS')]:
        MIS=[]; eta=res[pol]; p=X[blocks[0]]; ARB=FEE=0.0; ntr=0; feesum=0; tollsum=0; harm=0; harmn=0; tollon=0; QV=0; prevX=p
        kappa=0.5; zc=2.0; s2=(1*BP)**2
        for t in blocks:
            x=X[t]; QV+=0.5*(x-prevX)**2; prevX=x; MIS.append((x-p)**2)
            if pol=='STATIC': f0=fs*BP; sg=None
            else:
                sg=sig(pol,t)/math.sqrt(Y); f0=eta*sg*math.sqrt(dt/2)
            feesum+=f0
            z=x-p
            if toll is None:
                if abs(z)>f0:
                    d=abs(z)-f0; ARB+=0.5*d*d; FEE+=f0*d; ntr+=1; p=x-math.copysign(f0,z)
                continue
            to=report_at(t); m=X[to]; tau=t-to
            Vm=s2+sg*sg*tau
            if toll.startswith('dead'): w=1.0; B=zc*math.sqrt(Vm)
            else:
                u=sg*math.sqrt(dt/2); P=1/(1+f0/u); Vp=(1-P)*f0*f0/3+P*((f0+u)**2+u*u)
                w=Vp/(Vp+Vm); B=zc*math.sqrt(Vp*Vm/(Vp+Vm))
            def phi(q,dirn):  # marginal fee at pool level q for direction dirn
                e=dirn*(m-q)
                return f0+kappa*max(0.0,w*e-B)
            # retail cost metric: toll on a small buy and a small sell at current state
            tb=phi(p,1)-f0; ts=phi(p,-1)-f0; tollsum+=0.5*(tb+ts); tollon+= (tb>0 or ts>0)
            # harm: small buyer all-in p+f0+tb vs x+f0 ; seller p-f0-ts vs x-f0
            for tt,dirn in ((tb,1),(ts,-1)):
                if tt>0:
                    hm=dirn*(p-x)+tt  # extra cost vs market+f0
                    if hm>0: harm+=hm; harmn+=1
            if abs(z)<=f0: continue
            dirn=1 if z>0 else -1
            if toll=='dead1':
                fe=phi(p,dirn)
                if abs(z)>fe:
                    d=abs(z)-fe; ARB+=0.5*d*d; FEE+=fe*d; ntr+=1; p=x-dirn*fe
            else:
                # split limit: integrate marginal fee along path
                q=p; steps=400; L=abs(z); h=L/steps; traded=False
                for i in range(steps):
                    qm=q+dirn*h/2
                    fe=phi(qm,dirn); gain=dirn*(x-qm)-fe
                    if gain<=0: break
                    ARB+=gain*h; FEE+=fe*h; q+=dirn*h; traded=True
                if traded: ntr+=1; p=q
        N=len(blocks)
        out.append((name,eta,feesum/N/BP,ntr/N,ARB/BP**2,FEE/BP**2,ARB/(ARB+FEE),tollsum/N/BP,tollon/N,harmn/N/2,(harm/max(harmn,1))/BP,math.sqrt(sum(MIS)/len(MIS))/BP))
    print(f"\n### {label} dt={dt}s  target mean fee {fs}bp  blocks={len(blocks)}")
    print(f"{'policy':22s} {'eta':>6s} {'meanfee':>7s} {'Ptr':>6s} {'ARB':>9s} {'FEEarb':>9s} {'ARB/(A+F)':>9s} {'tollAvg':>7s} {'tollOn%':>7s} {'harm%':>6s} {'harmBp':>6s}")
    base=out[0][4]
    for o in out:
        print(f"{o[0]:22s} {o[1] if o[1] else 0:6.2f} {o[2]:7.2f} {o[3]:6.3f} {o[4]:9.0f} {o[5]:9.0f} {o[6]:9.3f} {o[7]:7.3f} {100*o[8]:7.2f} {100*o[9]:6.2f} {o[10]:6.2f}   ARB vs static {o[4]/base-1:+.1%}  RMSmis={o[11]:.1f}bp")
    print("RMS top-of-block mispricing of last policy (bp):",round(out[0][11]))
if __name__=='__main__':
    fn,dv,lab=sys.argv[1],sys.argv[2],sys.argv[3]
    for dt in [12,2]:
        for fs in [5,30]:
            run(fn,dv,dt,fs,lab)
