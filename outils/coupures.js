// Coupures artificielles du visage : état, opacité et filtres au fil du temps.
// Lancer : FILM_Y4M=chemin/film.y4m node outils/coupures.js  (playwright-core requis)
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const ROOT='/home/user/optique-noe';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.glb':'model/gltf-binary','.task':'application/octet-stream','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.css':'text/css'};
const srv=http.createServer((q,s)=>{const p=decodeURIComponent(q.url.split('?')[0]);
 fs.readFile(path.join(ROOT,p==='/'?'index.html':p),(e,d)=>{if(e){s.writeHead(404);s.end();return;}
  s.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});s.end(d);});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const HOOK=`window.__t={etat:()=>_etatSuivi,op:()=>$('glCanvas').style.opacity,filtre:()=>_poseP!==null,eff:()=>_effacements,
 couper:(ms)=>{const fl=faceLandmarker; if(!fl.__o){fl.__o=fl.detectForVideo.bind(fl);
  fl.detectForVideo=(...a)=>(window.__coupe&&performance.now()<window.__coupe)?{faceLandmarks:[],facialTransformationMatrixes:[]}:fl.__o(...a);}
  window.__coupe=performance.now()+ms;}};`;
(async()=>{await new Promise(r=>srv.listen(8181,r));
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+(process.env.FILM_Y4M||'visage.y4m'),'--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({permissions:['camera'],viewport:{width:1080,height:1920}});
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 await pg.route('**/index.html*',async r=>{const rep=await r.fetch();let t=await rep.text();const i=t.lastIndexOf('</script>');
   await r.fulfill({body:t.slice(0,i)+HOOK+t.slice(i),headers:{'content-type':'text/html'}});});
 await pg.goto('http://127.0.0.1:8181/index.html');
 await pg.waitForSelector('#startBtn');await pg.evaluate(()=>document.getElementById('startBtn').click());
 // attendre « suit »
 let ok=false;for(let i=0;i<90;i++){await pause(500);if(await pg.evaluate(()=>window.__t&&window.__t.etat())==='suit'){ok=true;break;}}
 console.log('état stable atteint :',ok);
 const lire=()=>pg.evaluate(()=>[window.__t.etat(),+window.__t.op(),window.__t.filtre()]);
 const res=[];
 for(const ms of [300,600,900,1500,3000]){
   await pause(2500);
   const eff0=await pg.evaluate(()=>window.__t.eff());
   await pg.evaluate(m=>window.__t.couper(m),ms);
   const t0=Date.now();const ech=[];let minOp=1,filtreVu=true,etats=new Set();
   while(Date.now()-t0<ms+4500){const [e,o,f]=await lire();etats.add(e);minOp=Math.min(minOp,o);
     if(Date.now()-t0<ms+200&&!f)filtreVu=false; // filtre remis à zéro PENDANT la coupure ?
     ech.push([Date.now()-t0,e,o]);await pause(60);}
   const retour=ech.find(x=>x[0]>ms&&x[1]==='suit'&&x[2]===1);
   const effN=(await pg.evaluate(()=>window.__t.eff()))-eff0;
   res.push({coupure_ms:ms,etats:[...etats].join('>'),opacite_min:+minOp.toFixed(2),
     filtres_gardes:filtreVu,effacements:effN,retour_pleine_opacite_ms:retour?retour[0]-ms:null});
 }
 console.table(res);console.log('erreurs page:',errs.length?errs.slice(0,3):'aucune');
 await b.close();srv.close();})();
