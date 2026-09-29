"""Rebuild homepage brand marks and exit signage in the media sandbox.
Requires OpenCV, NumPy, Pillow, DejaVu Sans and ffmpeg.
Inputs: original.mp4 (prior homepage film) and logo.png (official transparent art).
Outputs: fixed1080.mp4, scene2.webp, scene3.webp, review.jpg, label-tracks.json.
"""

import cv2,numpy as np,subprocess,json
from PIL import Image,ImageDraw,ImageFont
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
,
 dict(start=480,end=600,ref=540,quad=[[1178,149],[1238,151],[1237,192],[1176,194]])
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
 if i>=480:
  # Preserve the sign's position and housing, replace only the distorted face.
  W,H=600,360
  sign=Image.new('RGB',(W,H),(173,173,159))
  draw=ImageDraw.Draw(sign)
  draw.rectangle((3,3,W-4,H-4),outline=(145,146,133),width=7)
  font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',148)
  box=draw.textbbox((0,0),'EXIT',font=font)
  draw.text(((W-(box[2]-box[0]))/2,(H-(box[3]-box[1]))/2-box[1]),'EXIT',font=font,fill=(191,47,41))
  patch=cv2.cvtColor(np.array(sign),cv2.COLOR_RGB2BGR)
  M=cv2.getPerspectiveTransform(np.float32([[0,0],[W-1,0],[W-1,H-1],[0,H-1]]),p)
  warped=cv2.warpPerspective(patch,M,(1920,1080))
  alpha=cv2.warpPerspective(np.full((H,W),255,np.uint8),M,(1920,1080))/255.
  frames[i]=(warped*alpha[:,:,None]+frame*(1-alpha[:,:,None])).astype(np.uint8)
  continue
 # Remove the source label/lettering before projecting transparent official art.
 cleanmask=np.zeros((1080,1920),np.uint8)
 center=p.mean(0)
 erase=center+(p-center)*1.06
 cv2.fillConvexPoly(cleanmask,np.round(erase).astype(int),255)
 if i<240:
  # Sample the same cardboard plane immediately below the former sticker.
  dxdy=((p[3]-p[0])+(p[2]-p[1]))*.85
  donor=cv2.warpAffine(frame,np.float32([[1,0,-dxdy[0]],[0,1,-dxdy[1]]]),(1920,1080),borderMode=cv2.BORDER_REFLECT)
  blend=cv2.GaussianBlur(cleanmask,(9,9),1.7).astype(float)/255.
  cleaned=(donor*blend[:,:,None]+frame*(1-blend[:,:,None])).astype(np.uint8)
 else:
  # Reconstruct the white carton face, retaining its natural lighting and print below.
  cleaned=cv2.inpaint(frame,cleanmask,5,cv2.INPAINT_TELEA)
 W,H=600,210
 rgba=np.zeros((H,W,4),np.uint8)
 lw=550;lh=round(logo.shape[0]*lw/logo.shape[1])
 art=cv2.resize(logo,(lw,lh),interpolation=cv2.INTER_AREA)
 art[:,:,:3]=(art[:,:,:3].astype(float)*(.77 if i<240 else .88)).astype(np.uint8)
 rgba[(H-lh)//2:(H-lh)//2+lh,(W-lw)//2:(W-lw)//2+lw]=art
 M=cv2.getPerspectiveTransform(np.float32([[0,0],[W-1,0],[W-1,H-1],[0,H-1]]),p)
 warped=cv2.warpPerspective(rgba,M,(1920,1080))
 a=warped[:,:,3:4].astype(float)/255.
 frames[i]=(warped[:,:,:3]*a+cleaned*(1-a)).astype(np.uint8)
pipe=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','24','-i','-','-an','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart','fixed1080.mp4'],stdin=subprocess.PIPE)
for f in frames:pipe.stdin.write(f.tobytes())
pipe.stdin.close();assert pipe.wait()==0
for idx,name in [(180,'scene2.webp'),(300,'scene3.webp')]:cv2.imwrite(name,frames[idx],[cv2.IMWRITE_WEBP_QUALITY,85])

sheet=Image.new('RGB',(1920,810))
for j,idx in enumerate([144,180,228,252,300,348,480,540,588]):
 p=tracks[idx];x,y=p.mean(0).astype(int)
 x=max(0,min(1920-480,x-240));y=max(0,min(1080-270,y-135))
 tile=Image.fromarray(cv2.cvtColor(frames[idx][y:y+270,x:x+480],cv2.COLOR_BGR2RGB))
 sheet.paste(tile,((j%3)*640,(j//3)*270))
sheet.save('review.jpg')
print('composite complete',len(frames),flush=True)
