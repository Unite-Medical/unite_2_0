// Rebuild versioned mobile assets from the approved originals. Requires sharp.
import {createRequire} from 'node:module';import fs from 'node:fs/promises';
const sharp=createRequire(import.meta.url)(process.env.SHARP_MODULE||'sharp');
const pub=process.cwd()+'/public';const out='/images/mobile-v1';await fs.mkdir(pub+out,{recursive:true});
for(const [source,name,width,quality] of [['/brand/unite-medical-logo.png','logo',480,85],['/images/robotics/da-vinci-xi-system.jpg','robotics-system',1200,80],['/images/regenicool/wraps.png','wraps',1000,82],['/images/regenicool/red-device.png','regenicool',1000,82],['/images/program-films/welllink-poster.jpg','welllink',1400,80],['/images/program-films/tjs-poster.jpg','tjs',1400,80]]){
 const dest=pub+out+'/'+name+'.webp';await sharp(pub+source).resize({width,withoutEnlargement:true}).webp({quality}).toFile(dest);console.log(name,(await fs.stat(pub+source)).size,'→',(await fs.stat(dest)).size);
}
const input=pub+'/media/homepage-film/hero-poster.webp';const m=await sharp(input).metadata();const w=Math.round(m.height*.55);await sharp(input).extract({left:Math.round((m.width-w)*.65),top:0,width:w,height:m.height}).webp({quality:82}).toFile(pub+out+'/home-hero.webp');console.log('mobile hero',(await fs.stat(pub+out+'/home-hero.webp')).size);
