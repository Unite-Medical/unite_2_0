"""Rebuild hero labels in the media processing sandbox.

Requires OpenCV, NumPy, Pillow and ffmpeg. Supply original.mp4 (the previous
30-second homepage film) and logo.png (public/brand/unite-medical-logo.png).
Outputs fixed1080.mp4, two updated sector stills, review.jpg and label-tracks.json.
The official raster artwork is projected directly; no generated logo is used.
"""
import cv2,numpy as np,subprocess,json
from PIL import Image,ImageDraw
cap=cv2.VideoCapture('original.mp4'); frames=[]
while True:
 ok,f=cap.read()
 if not ok:break
 frames.append(f)
logo=cv2.imread('logo.png',cv2.IMREAD_UNCHANGED)
# Exact official artwork, composited onto the existing label planes.
configs=[
 dict(start=120,end=240,ref=180,quad=[[1356,516],[1557,531],[1557,607],[1356,591]],roi=[1335,500,245,135]),
 dict(start=240,end=360,ref=300,quad=[[421,693],[568,670],[570,723],[423,750]],roi=[402,682,176,125])
]
tracks={}
for c in configs:
 ref=c['ref']; origin=np.float32(c['quad']); tracks[ref]=origin
 for direction in [-1,1]:
  points=origin.copy(); prev=frames[ref]; velocity=np.zeros(2)
  for i in range(ref+direction,c['start']-1 if direction<0 else c['end'],direction):
   gray=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY); nxt=cv2.cvtColor(frames[i],cv2.COLOR_BGR2GRAY)
   mask=np.zeros(gray.shape,np.uint8)
   # Track only the package surface near the label, away from the moving hands.
   x0,y0=np.floor(points.min(0)-[12,6]).astype(int);x1,y1=np.ceil(points.max(0)+[12,24]).astype(int)
   cv2.rectangle(mask,(max(0,x0),max(0,y0)),(min(1919,x1),min(1079,y1)),255,-1)
   p=cv2.goodFeaturesToTrack(gray,70,.015,4,mask=mask)
   M=None
   if p is not None and len(p)>=3:
    z,st,err=cv2.calcOpticalFlowPyrLK(gray,nxt,p,None,winSize=(31,31),maxLevel=3)
    valid=(st.ravel()==1)&(err.ravel()<25)
    if valid.sum()>=3:
     M,inliers=cv2.estimateAffinePartial2D(p[valid],z[valid],method=cv2.RANSAC,ransacReprojThreshold=1.8)
   if M is not None and .96<np.linalg.det(M[:,:2])<1.04 and np.linalg.norm(M[:,2])<40:
    new=cv2.transform(points[None],M)[0];velocity=np.median(new-points,axis=0);points=new
   else:points=points+velocity
   tracks[i]=points.copy();prev=frames[i]
# Save geometry so the deterministic composite can be reproduced.
open('label-tracks.json','w').write(json.dumps({str(k):v.tolist() for k,v in tracks.items()}))
for i,p in tracks.items():
 frame=frames[i]
 W,H=600,210
  # Match the existing paper label's lighting rather than a bright digital white.
 bg=(185,181,179) if i<240 else (215,212,214)
 patch=np.full((H,W,3),bg,np.uint8)
 lw=550;lh=round(logo.shape[0]*lw/logo.shape[1])
 art=cv2.resize(logo,(lw,lh),interpolation=cv2.INTER_AREA)
 px=(W-lw)//2;py=(H-lh)//2
 a=art[:,:,3:4]/255.;rgb=art[:,:,:3].astype(float)*(.79 if i<240 else .91)
 patch[py:py+lh,px:px+lw]=(rgb*a+patch[py:py+lh,px:px+lw]*(1-a)).astype(np.uint8)
 src=np.float32([[0,0],[W-1,0],[W-1,H-1],[0,H-1]])
 M=cv2.getPerspectiveTransform(src,p)
 warped=cv2.warpPerspective(patch,M,(1920,1080))
 alpha=cv2.warpPerspective(np.full((H,W),255,np.uint8),M,(1920,1080))/255.
 frames[i]=(warped*alpha[:,:,None]+frame*(1-alpha[:,:,None])).astype(np.uint8)
pipe=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','24','-i','-','-an','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart','fixed1080.mp4'],stdin=subprocess.PIPE)
for f in frames:pipe.stdin.write(f.tobytes())
pipe.stdin.close();assert pipe.wait()==0
for idx,name in [(180,'scene2.webp'),(300,'scene3.webp')]:cv2.imwrite(name,frames[idx],[cv2.IMWRITE_WEBP_QUALITY,85])
sheet=Image.new('RGB',(1920,1080))
for j,idx in enumerate([132,156,180,228,240,276,300,348]):
 # Context crops preserve enough of each scene to inspect the surface placement.
 p=tracks[idx];x,y=p.mean(0).astype(int)
 x=max(0,min(1920-640,x-320));y=max(0,min(1080-360,y-180))
 tile=Image.fromarray(cv2.cvtColor(frames[idx][y:y+360,x:x+640],cv2.COLOR_BGR2RGB)).resize((480,540))
 sheet.paste(tile,((j%4)*480,(j//4)*540))
ImageDraw.Draw(sheet).text((5,5),'Tracked official logo: packing / shelf',fill='white')
sheet.save('review.jpg')
print('composite complete',len(frames),flush=True)
