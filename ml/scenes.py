"""Procedural grayscale scenes shared by the trainer and the exposure benchmark."""
import numpy as np

CLASSES = ["lit", "dark", "uneven", "glare", "day"]


def scene(k,seed,S=48):
    rng=np.random.default_rng(seed)
    y,x=np.mgrid[0:S,0:S].astype('float32')/(S-1)
    horizon=float(rng.uniform(.40,.61))
    if k=='day':
        z=np.where(y<horizon,.74-.13*y,.51+.14*y)
    else:
        z=np.where(y<horizon,.06+.03*y,{'lit':.25,'dark':.05,'uneven':.11,'glare':.07}[k]+.02*y)
    z=z.astype('float32')
    for side in [0,1]:
        width=int(rng.uniform(.1,.27)*S);roof=rng.uniform(.05,.30)
        mask=(x<(width/S) if side==0 else x>(1-width/S))&(y>roof)
        z[mask]*=.55
    road=(np.abs(x-.5)<.10+.55*np.maximum(0,y-horizon))&(y>horizon)
    z[road]+=.016 if k!='day' else .075
    if k=='lit':
        for cx in rng.uniform(.20,.83,int(rng.integers(2,5))):
            cy=float(rng.uniform(.32,.56));r=float(rng.uniform(.035,.065))
            z+=.58*np.exp(-((x-cx)**2+(y-cy)**2)/(2*r*r))
            z+=.16*np.exp(-((x-cx)**2+(y-.8)**2)/(2*(r*3)**2))*(y>horizon)
    elif k=='uneven':
        side=float(rng.choice([.16,.84]))
        z+=.48*np.exp(-((x-side)**2+(y-.45)**2)/(2*.065**2))
        z+=.2*np.exp(-((x-side)**2)/(2*.15**2))*(y>horizon)
    elif k=='glare':
        cx=float(rng.uniform(.31,.72));cy=float(rng.uniform(.28,.53));r=float(rng.uniform(.09,.15))
        z+=.99*np.exp(-((x-cx)**2+(y-cy)**2)/(2*r*r))
        z+=.22*np.exp(-((x-cx)**2)/(2*.018**2))
    elif k=='dark' and rng.random()<.30:
        cx=float(rng.uniform(.26,.74))
        z+=.11*np.exp(-((x-cx)**2+(y-.48)**2)/(2*.04**2))
    z+=(rng.normal(0,.013,(S,S))).astype('float32')
    z=z*rng.uniform(.77,1.25)+rng.uniform(-.008,.009)
    return np.clip(z,0,1).astype('float32')
