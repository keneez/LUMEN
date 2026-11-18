"""Improve readability of gallery without making images look like real CCTV.
Synthetic grayscale camera-like frames retain CNN input and watermark.
Run exactly once after train_vision.py (image output)."""
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]/'assets'
for kind in ['lit','dark','uneven','glare','day']:
 p=ROOT/f'{kind}.jpg'
 im=Image.open(p).convert('RGBA');w,h=im.size
 over=Image.new('RGBA',im.size,(0,0,0,0));d=ImageDraw.Draw(over,'RGBA')
 # Streetline geometry, perspective, and CCTV annotations.
 d.line([(385,215),(125,468)],fill=(175,179,190,65),width=4)
 d.line([(501,215),(792,468)],fill=(170,178,191,65),width=4)
 for y in [300,358,421]:
  d.line([(435,y),(444,y+25)],fill=(220,214,192,75),width=5)
 for x,top,width in [(24,130,155),(180,67,92),(577,85,126),(741,130,105)]:
  d.rectangle([x,top,x+width,245],outline=(63,79,96,105),width=3)
  for xx in range(x+18,x+width-13,31):
   for yy in range(top+17,240,33):d.rectangle([xx,yy,xx+9,yy+12],fill=(160,168,164,45))
 for x,y in [(226,280),(654,258),(747,319)]:
  d.line((x,456,x,y),fill=(128,139,152,90),width=6)
  d.line((x,y,x-26,y),fill=(153,160,164,90),width=4)
  if kind=='lit' or kind=='day':d.ellipse((x-39,y-14,x-15,y+9),fill=(244,219,145,135))
  if kind=='uneven' and x==226:d.ellipse((x-40,y-13,x-14,y+12),fill=(245,210,130,110))
 if kind=='glare':
  d.ellipse((480,156,550,226),outline=(255,244,198,140),width=5)
 # Corner focus brackets; keep dark enough not to confuse display.
 for (x,y,dx,dy) in [(18,98,1,1),(w-18,98,-1,1),(18,451,1,-1),(w-18,451,-1,-1)]:
  d.line((x,y,x+25*dx,y),fill=(156,194,197,135),width=3)
  d.line((x,y,x,y+25*dy),fill=(156,194,197,135),width=3)
 im=Image.alpha_composite(im,over).convert('RGB');im.save(p,quality=94)
print('gallery enhanced')
