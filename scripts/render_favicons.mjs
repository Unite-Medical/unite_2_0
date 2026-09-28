// Render the existing UMLogoMark SVG composition from approved transparent artwork.
// Run with SHARP_MODULE set when sharp is provided by an external asset toolchain.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const sharp=createRequire(import.meta.url)(process.env.SHARP_MODULE || 'sharp');
const pub=new URL('../public/',import.meta.url);
const original=await readFile(new URL('brand/unite-medical-logo.png',pub));
const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><clipPath id="mark"><path d="M0 0H860V320H365V523H0Z"/></clipPath></defs><g transform="translate(72 244) scale(1.023)"><image href="data:image/png;base64,${original.toString('base64')}" width="2000" height="523" clip-path="url(#mark)"/></g></svg>`);
const render=size=>sharp(svg).resize(size,size).png().toBuffer();
for(const size of [16,32,96,180,192,512])await writeFile(new URL(`favicon-${size}.png`,pub),await render(size));
await writeFile(new URL('apple-touch-icon.png',pub),await render(180));
await writeFile(new URL('brand/unite-medical-icon.png',pub),await render(180));
await writeFile(new URL('brand/unite-mark-transparent.png',pub),await render(512));
await writeFile(new URL('brand/unite-intercom-launcher.png',pub),await render(72));
await writeFile(new URL('images/source/um-logo-mark.png',pub),await render(1024));
const png=await render(512);
await writeFile(new URL('favicon.svg',pub),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${png.toString('base64')}"/></svg>`);
const sizes=[16,32,48],images=await Promise.all(sizes.map(render));
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;
images.forEach((b,i)=>{const p=6+16*i;header[p]=sizes[i];header[p+1]=sizes[i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(b.length,p+8);header.writeUInt32LE(offset,p+12);offset+=b.length;});
await writeFile(new URL('favicon.ico',pub),Buffer.concat([header,...images]));
const manifest=JSON.parse(await readFile(new URL('site.webmanifest',pub),'utf8'));
manifest.icons=manifest.icons.filter(i=>i.purpose!=='any maskable').map(i=>({...i,src:i.src.split('?')[0]+'?v=official-20260928'}));
await writeFile(new URL('site.webmanifest',pub),JSON.stringify(manifest,null,2)+'\n');
console.log('Rendered official transparent Unite icons in',fileURLToPath(pub));
