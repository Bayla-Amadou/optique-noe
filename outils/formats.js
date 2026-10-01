// Les deux formats de borne, côte à côte. On vérifie à chaque fois que
// l'image analysée et l'image affichée ont bien la même orientation, que
// le rendu 3D est au même gabarit, et que rien n'est tombé en erreur.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT='/home/user/optique-noe';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm',
 '.glb':'model/gltf-binary','.task':'application/octet-stream','.tflite':'application/octet-stream',
 '.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg',
 '.webp':'image/webp','.woff2':'font/woff2','.css':'text/css','.bin':'application/octet-stream'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await new Promise(r=>srv.listen(8149,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--allow-file-access-from-files','--enable-unsafe-swiftshader']});
 const bilan={};
 for(const [nom,vp] of [['paysage',{width:1440,height:900}],['portrait',{width:1080,height:1920}]]){
   const ctx=await b.newContext({permissions:['camera'],viewport:vp,deviceScaleFactor:1});
   const pg=await ctx.newPage();
   const erreurs=[];
   pg.on('pageerror',e=>erreurs.push(String(e).slice(0,160)));
   pg.on('response',r=>{if(r.status()>=400)erreurs.push(r.status()+' '+r.url().replace('http://127.0.0.1:8149',''));});
   pg.on('console',m=>{if(m.type()==='error'&&!/XNNPACK|TensorFlow/.test(m.text())) erreurs.push(m.text().slice(0,160));});
   await pg.goto('http://127.0.0.1:8149/index.html');
   await pg.waitForSelector('#startBtn'); await pg.click('#startBtn');
   await pause(14000);
   await pg.screenshot({path:process.argv[2]+'/fmt-'+nom+'.png'});
   bilan[nom]=await pg.evaluate(()=>{
     const q=id=>document.getElementById(id);
     const r=el=>{const b=el.getBoundingClientRect();return [Math.round(b.width),Math.round(b.height)];};
     return {
       classe: document.documentElement.className,
       tampon_analyse: [q('camFrame').width, q('camFrame').height],
       tampon_3d:      [q('glCanvas').width, q('glCanvas').height],
       affichage_video: r(q('cam')),
       affichage_3d:    r(q('glCanvas')),
       flux: (()=>{const t=q('cam').srcObject&&q('cam').srcObject.getVideoTracks()[0];
                   const s=t&&t.getSettings?t.getSettings():{}; return [s.width,s.height];})(),
       badge: (q('poseDbg')||{}).textContent || ''
     };});
   bilan[nom].erreurs=[...new Set(erreurs)].slice(0,4);
   await ctx.close();
 }
 // contrôles
 const ec=[];
 for(const [nom,v] of Object.entries(bilan)){
   const [aw,ah]=v.tampon_analyse, [gw,gh]=v.tampon_3d;
   if(aw!==gw||ah!==gh) ec.push(nom+' : le rendu 3D et l\'image analysée n\'ont pas le même gabarit');
   const [dw,dh]=v.affichage_video, [rw,rh]=v.affichage_3d;
   if(Math.abs(dw-rw)>1||Math.abs(dh-rh)>1) ec.push(nom+' : la vidéo et le rendu ne se superposent pas à l\'écran');
   if(Math.abs(dw/dh - aw/ah)>0.02) ec.push(nom+' : l\'affichage déforme l\'image analysée');
   if(v.erreurs.length) ec.push(nom+' : erreurs → '+v.erreurs.join(' | '));
 }
 // Règle voulue : le format de l'IMAGE ne suit pas celui de l'ÉCRAN.
 // La caméra travaille en 4:3 dans les deux cas — tête, épaules, un peu
 // d'air autour — et c'est la mise en page qui s'adapte.
 for(const [nom,v] of Object.entries(bilan)){
   const [w,h]=v.tampon_analyse;
   if(Math.abs(w/h - 4/3) > 0.01) ec.push(`${nom} : l'image de travail n'est pas en 4:3 (${w}x${h})`);
 }
 console.log(JSON.stringify({...bilan, resultat: ec.length?'ÉCHEC':'OK', echecs:ec}, null, 1));
 await b.close(); srv.close(); process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
