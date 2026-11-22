# The Qilin board (Design canvas "Qilin from the kit"): three directions drawn from kit parts in a side view. python3 directions.py -> A/B/C.svg
from compose import *
import math
G='#E8B04A'; J='#5BE39A'; INK='#ECE8DE'; R='#FF4D5E'; F='#1D1D20'; F2='#232327'
def qilin(HEAD=('P280',702,128,146,-80,False),horn='single', flames=1.0, clouds=True, halo=False, antler=False, ground=522):
    it=[]
    it.append(f'<line x1="60" y1="{ground}" x2="840" y2="{ground}" stroke="rgba(236,232,222,.14)"/>')
    if halo: it.append(part('P181',600,170,330,stroke=G,fill='none',op=.35))
    if clouds:
        for x in (350,392,545,585): it.append(part('P013',x,ground+4,52,stroke=INK,fill='none',op=.3))
    # far legs
    for x,fl in ((392,False),(585,True)): it.append(part('P723',x,300,228,flip=fl,sx=.32,stroke=G,fill=F,op=.5,anchor=(0.1 if not fl else -0.1,-0.5)))
    # tail: a thin stalk and a flame plume
    it.append(part('P094',282,212,150*max(.6,flames),rot=-25,flip=True,stroke=R,fill=F))
    # far flames
    if flames>.5: it.append(part('P291',362,246,120*flames,rot=-5,flip=True,stroke=R,fill=F,op=.6))
    # body: scale bands across the barrel, big in the chest, tapering to the haunch
    bands=[]
    for i in range(9):   # an arched back over a tucked belly: shallow at the haunch, deepest in the chest
        q=i/8; x=340+q*215; h=70+48*math.sin(q*2.6)**1.2; y=286-14*math.sin(q*math.pi)+q*6+ (1-q)*4
        bands.append((x,y,h))
    for x,y,h in bands: it.append(part('P564',x,y,h,stroke=G,fill=F))
    it.append(part('P448',450,290,44,stroke=J,fill=F))
    # near legs, with hooves
    for x,fl in ((350,False),(545,True)): it.append(part('P723',x,305,228,flip=fl,sx=.32,stroke=G,fill=F,anchor=(0.1 if not fl else -0.1,-0.5)))
    for x in (350,392,545,585): it.append(part('P440',x+(8 if x>450 else -8),ground-9,24,stroke=G,fill=F))
    # near flames: shoulder, haunch, elbows
    if flames>0:
        it.append(part('P290',552,226,128*flames,rot=-38,flip=True,stroke=R,fill=F))
        it.append(part('P291',350,232,112*flames,rot=8,flip=True,stroke=R,fill=F))
        if flames>.7:
            it.append(part('P015',530,392,58*flames,rot=-80,stroke=R,fill=F))
            it.append(part('P015',336,398,54*flames,rot=-100,flip=True,stroke=R,fill=F))
    # neck: bands climbing to the head, each smaller
    neck=[(585,252,84,30),(605,226,76,34),(622,200,68,38),(637,176,60,42),(650,154,54,46)]
    for x,y,h,r in neck: it.append(part('P564',x,y,h,rot=r,stroke=J,fill=F))
    if flames>0: it.append(part('P093',602,182,96*flames,rot=-70,flip=True,stroke=R,fill=F))   # mane flame down the neck
    # head in profile, snout forward
    it.append(part(HEAD[0],HEAD[1],HEAD[2],HEAD[3],rot=HEAD[4],flip=HEAD[5],stroke=G,fill=F))
    if horn=='single': it.append(part('P293',712,98,64,rot=20,anchor=(0,0.45),stroke=J,fill=F))
    if antler:
        it.append(part('P656',690,70,96,rot=-20,flip=True,stroke=J,fill=F,op=.6))
        it.append(part('P656',705,66,104,rot=-5,flip=True,stroke=J,fill=F))
    it.append(part('P017',768,146,96,rot=-20,flip=True,anchor=(-0.5,-0.2),stroke=INK,fill='none'))   # whiskers trailing back from the snout
    it.append(part('P018',762,152,80,rot=-38,flip=True,anchor=(-0.5,-0.2),stroke=INK,fill='none',op=.7))
    return it
if __name__=='__main__':
    render('A',svg(qilin(horn='single',flames=.6,clouds=True)))
    render('B',svg(qilin(horn=None,antler=True,flames=1.2,clouds=False)))
    render('C',svg(qilin(horn='single',flames=.9,clouds=True,halo=True)))
