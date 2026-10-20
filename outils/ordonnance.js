// L'apercu de l'ecran ordonnance doit avoir EXACTEMENT le meme rapport que
// le rendu 3D, sinon la monture y est etiree. Et le cadrage de l'essayage
// doit laisser voir les epaules, pas seulement le visage.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT='/home/user/optique-noe';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript',
 '.wasm':'application/wasm','.glb':'model/gltf-binary','.task':'application/octet-stream',
 '.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg',
 '.webp':'image/webp','.woff2':'font/woff2','.css':'text/css','.tflite':'application/octet-stream'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await new Promise(r=>srv.listen(8167,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,
  args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--use-file-for-fake-video-capture='+process.argv[2],'--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
 const pg=await ctx.newPage();
 pg.on('pageerror',e=>console.log('[ERREUR PAGE]',String(e).slice(0,200)));
 const HOOK=`window.__o={zoom:()=>_zoom, cible:()=>[VISAGE_LOIN,VISAGE_PRES],
   part:()=>landmarks?Math.abs(landmarks[10].y-landmarks[152].y)*_zoom:null};`;
 await pg.route('**/index.html',async r=>{const rep=await r.fetch();let t=await rep.text();
   const i=t.lastIndexOf('</script>');
   await r.fulfill({body:t.slice(0,i)+HOOK+t.slice(i),headers:{'content-type':'text/html; charset=utf-8'}});});
 await pg.goto('http://127.0.0.1:8167/index.html');
 await pg.waitForSelector('#startBtn'); await pg.click('#startBtn');
 await pause(12000);
 await pg.screenshot({path:process.argv[3]+'/ord-essayage.png'});
 const essai=await pg.evaluate(()=>({
   badge:(document.getElementById('poseDbg')||{}).textContent||'',
   zoom:+window.__o.zoom().toFixed(2), cible:window.__o.cible(),
   part_visage: window.__o.part() }));
 // passer a l'ordonnance
 await pg.click('#confirmBtn'); await pause(4000);
 await pg.screenshot({path:process.argv[3]+'/ord-scan.png'});
 const ord=await pg.evaluate(()=>{
   const w=document.querySelector('.ord-cam-wrap'); if(!w) return null;
   const r=w.getBoundingClientRect();
   const gl=document.getElementById('glCanvas');
   const og=document.getElementById('ordGlCanvas');
   return { rapport_apercu:+(r.width/r.height).toFixed(4),
            rapport_rendu:+(gl.width/gl.height).toFixed(4),
            tampon_ord:[og.width,og.height], visible:r.width>0 };
 });
 const ec=[];
 if(!ord) ec.push("la page ordonnance n'est pas atteinte");
 else {
   if(Math.abs(ord.rapport_apercu-ord.rapport_rendu)>0.01)
     ec.push(`apercu ${ord.rapport_apercu} contre rendu ${ord.rapport_rendu} : la monture y sera etiree`);
 }
 if(/\bfix\b/.test(essai.badge)) ec.push('le temoin « fix » est toujours dans le badge');
 if((essai.badge.match(/ms/g)||[]).length>1) ec.push('le temps par image apparait deux fois');
 // Regle voulue : en approchant, le cadre SE RESSERRE. La seule limite est
 // que la tete entiere reste dans l'image — front et menton compris.
 if(essai.part_visage!=null && essai.part_visage>0.82)
   ec.push(`le visage occupe ${(essai.part_visage*100).toFixed(0)} % : la tete deborde du cadre`);
 console.log(JSON.stringify({essayage:essai, ordonnance:ord,
   resultat:ec.length?'ÉCHEC':'OK', echecs:ec},null,1));
 await b.close();srv.close();process.exit(ec.length?1:0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
