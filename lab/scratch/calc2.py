import math
Y=365*86400
def cor2(sig_ann, dt, fee_bp):
    sig=sig_ann/math.sqrt(Y); lam=1/dt; g=math.log(1+fee_bp/1e4)
    eta=math.sqrt(2*lam)*g/sig; P=1/(1+eta)
    lvr=sig**2/8
    arb=lvr*P*math.exp(g/2)/(1-sig**2/(8*lam))
    fee=lvr*(math.exp(g/2)-math.exp(-g/2))/g/(1+sig/(math.sqrt(2*lam)*g))/(1+sig/(2*math.sqrt(2*lam)))
    return P, arb/lvr, fee/lvr, (arb+fee)/lvr
print("Corollary 2 (CPMM, exact) : Ptrade, ARB/LVR, FEE/LVR, (ARB+FEE)/LVR")
for dt in [12,2,0.25]:
    for f in [2,6,30]:
        P,a,fe,s=cor2(0.48,dt,f); print(f" dt={dt:5}s fee={f:3}bp  Ptr={P:.3f} ARB/LVR={a:.3f} FEE/LVR={fe:.3f} sum={s:.4f}")
print("\nLVR per $ of position, sigma=48%: full-range CPMM and concentrated v3 ranges [P/(1+r), P(1+r)] at center")
base=0.48**2/8
print(f" full range: {base*100:.2f}%/yr = {base/365*1e4:.2f} bp/day")
for r in [0.01,0.05,0.10,0.25]:
    M=1/(1-1/math.sqrt(1+r)); print(f" +/-{r*100:.0f}%: multiplier {M:6.1f} -> LVR {base*M*100:7.1f}%/yr = {base*M/365*1e4:6.1f} bp/day")
# Corollary 1: sd of top-of-block mispricing
def sigz(sig_ann, dt, fee_bp):
    sig=sig_ann/math.sqrt(Y); lam=1/dt; g=math.log(1+fee_bp/1e4)
    P=1/(1+math.sqrt(2*lam)*g/sig); u=sig/math.sqrt(2*lam)
    return math.sqrt((1-P)*g*g/3 + P*((g+u)**2+u*u)), P
print("\nCorollary 1: sd of pool mispricing sigma_z (bp)")
for dt in [12,2,0.25]:
    print(" dt",dt, [(f, round(sigz(0.48,dt,f)[0]*1e4,2)) for f in [2,5,6,30]])
print("\nReference uncertainty sigma*sqrt(tau) (bp), sigma=48% and 96%")
for tau in [30,60,120,300,900]:
    print(f" tau={tau:4d}s: {0.48*math.sqrt(tau/Y)*1e4:5.2f} bp | {0.96*math.sqrt(tau/Y)*1e4:5.2f} bp")
print("\nBayesian toll weight w = Vp/(Vp+Vm), Vm = s^2 + sigma^2 tau, s=2bp, sigma=48%")
for dt,f in [(12,5),(12,30),(2,5),(0.25,5),(0.25,30)]:
    sz,_=sigz(0.48,dt,f); Vp=(sz*1e4)**2
    out=[]
    for tau in [30,60,120]:
        Vm=4+((0.48*math.sqrt(tau/Y))*1e4)**2
        w=Vp/(Vp+Vm); Vpost=Vp*Vm/(Vp+Vm)
        thr=2*math.sqrt(Vpost)/w  # |g| threshold for z=2
        out.append(f"tau={tau}: w={w:.2f} sqrtVpost={math.sqrt(Vpost):.2f}bp trigger|g|>{thr:.1f}bp")
    print(f" dt={dt}s fee={f}bp sigma_z={sz*1e4:.2f}bp :: "+" ; ".join(out))
