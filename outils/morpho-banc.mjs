import fs from 'fs';
/**
 * Banc de la mesure de morphologie : une tête simulée, de dimensions connues, est vue
 * de face puis de trois quarts, projetée comme par une caméra ; on vérifie que
 * l'échantillonneur de index.html retrouve les dimensions.
 * Lancer : node outils/morpho-banc.mjs
 */
import * as THREE from 'three';
const s=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const a=s.indexOf('const MORPHO_PTS'), b=s.indexOf("// L'avis de participation");
const code=s.slice(a,b);
const W=640,H=480,FOCAL_PX=500; let _mpMatrix=null;
// tête simulée, repère tête en cm : x droite, y haut, z vers l'avant
const T={234:[-7.4,0,-3],454:[7.0,0,-3.4],127:[-6.6,2.5,0],356:[6.6,2.5,0],168:[0,2.8,5.0],129:[-1.8,-2.2,5.2],358:[1.8,-2.2,5.2],10:[0,9.0,2.0],152:[0,-9.0,2.5],468:[-3.2,1.2,3.6],473:[3.2,1.2,3.6]};
let mat;
const api=new Function('THREE','W','H','FOCAL_PX','getM',code.replace(/_mpMatrix/g,'getM()')+';return {morphoRaz,morphoEchantillon,morphoResultat}')(THREE,W,H,FOCAL_PX,()=>mat);
api.morphoRaz();
const prof=55;
for(const yawDeg of [0,2,-3,1,25,28,-27,-30,22,-24]) for(let rep=0;rep<12;rep++){
  const th=(yawDeg+((rep%3)-1)*0.5)*Math.PI/180;
  const M=new THREE.Matrix4().makeRotationY(th).setPosition(0.3,0.1,-prof);
  mat=M.elements.slice(); 
  const lm={};
  for(const [i,p] of Object.entries(T)){const P=new THREE.Vector3(...p).applyMatrix4(M); const zl=-P.z;
    const x=(P.x*FOCAL_PX/zl)/W+0.5, y=0.5-(P.y*FOCAL_PX/zl)/H; const kxy=prof/FOCAL_PX;
    lm[i]={x,y,z:(zl-prof)/(W*kxy)}; }
  api.morphoEchantillon(lm); api.morphoEchantillon(lm);
}
const r=api.morphoResultat(); console.log(r);
const att={tempes_cm:13.2,hauteur_visage_cm:18,nez_mm:36,oreille_prof_cm:6.8};const echecs=Object.entries(att).filter(([k,v])=>Math.abs(r[k]-v)>0.1);
if(echecs.length){console.error('ÉCHEC',echecs.map(([k,v])=>k+' '+r[k]+' ≠ '+v).join(' ; '));process.exit(1)}
console.log('MORPHO OK');
console.log('attendu : tempes 13.2, hauteur 18.0, nez 36, asym',(100*Math.abs(7.4-7.0)/14.4).toFixed(1),', oreille_prof',(((3.6)-((-3-3.4)/2))).toFixed(2));
