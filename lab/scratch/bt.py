import json, math
Y=365*86400; ZETA=1.4603545088095868
for fn,step,label in [('b1s_6h.json',1,'1s data 6h'),('b1m_7d.json',60,'1m data 7d')]:
    s=json.load(open(fn)); X=[math.log(float(r[4])) for r in s]
    for dt in ([2,12] if step==1 else [60,120]):
        k=dt//step; blocks=X[::k]
        r=[blocks[i+1]-blocks[i] for i in range(len(blocks)-1)]
        sb=math.sqrt(sum(x*x for x in r)/len(r))  # per-block sd
        for fee_bp in [1,2,5,10]:
            g=math.log(1+fee_bp/1e4)
            p=blocks[0]; n=0; arb=0; fee=0; lvr=0
            for i in range(1,len(blocks)):
                x=blocks[i]; lvr+=0.5*(x-blocks[i-1])**2
                z=x-p
                if abs(z)>g:
                    n+=1; d=abs(z)-g; arb+=0.5*d*d; fee+=g*d
                    p=x-math.copysign(g,z)
            N=len(blocks)-1
            eta=g/(sb/math.sqrt(2))
            print(f"{label} dt={dt:4d}s sigma_blk={sb*1e4:.2f}bp fee={fee_bp:2d}bp eta={eta:5.2f} | Ptrade obs={n/N:.3f} Poisson={1/(1+eta):.3f} det(NT)={1/(eta+ZETA/math.sqrt(math.pi)):.3f} | ARB/LVR obs={arb/lvr:.3f} Pois={1/(1+eta):.3f} det={1/(1+eta*math.sqrt(math.pi)/ZETA):.3f} | FEE/LVR obs={fee/lvr:.3f} | sum={(arb+fee)/lvr:.3f}")
