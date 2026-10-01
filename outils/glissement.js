/**
 * Banc de glissement : une tête qui hoche, passée dans la chaîne de filtres
 * de la borne. On mesure, EN PIXELS À L'ÉCRAN, de combien le centre du verre
 * affiché s'écarte du centre du verre réel. C'est ce que l'œil voit comme
 * « la monture glisse ».
 *
 * Le mouvement est synthétique, donc la vérité est connue exactement, ce
 * qu'aucune vidéo ne donne. Le bruit de mesure imite celui d'un suivi réel.
 * Lancer : node outils/glissement.js
 */
const THREE = require('three');

// ── Les filtres, recopiés tels quels de index.html ───────────────────
class LP { constructor(){this.y=null;} f(x,a){this.y=this.y===null?x:a*x+(1-a)*this.y;return this.y;} }
class OneEuro {
  constructor(mc=1,b=0.05,dc=1){this.mc=mc;this.b=b;this.dc=dc;this.x=new LP();this.dx=new LP();this.lt=null;this.lx=null;}
  a(c,dt){const tau=1/(2*Math.PI*c);return 1/(1+tau/dt);}
  f(x,t){
    if(this.lt===null){this.lt=t;this.lx=x;this.x.f(x,1);return x;}
    const dt=Math.max(1e-3,(t-this.lt)/1000);
    const dx=(x-this.lx)/dt;
    const edx=this.dx.f(dx,this.a(this.dc,dt));
    const y=this.x.f(x,this.a(this.mc+this.b*Math.abs(edx),dt));
    this.lt=t;this.lx=x;return y;
  }
}
class Kalman1D {
  constructor(q=0.001, r=0.01){ this.q=q; this.r=r; this.x=0; this.p=1; this._init=false; }
  update(z){ if(!this._init){this.x=z;this._init=true;return z;}
    this.p+=this.q; const k=this.p/(this.p+this.r); this.x+=k*(z-this.x); this.p*=(1-k); return this.x; }
}

// ── Monde synthétique ────────────────────────────────────────────────
const FPS = 30, F_PX = 693;               // 800 px de large, 60° de champ
const PIVOT = new THREE.Vector3(0, 0, -52);   // articulation du cou
const NASION = new THREE.Vector3(0, 11, 8);   // nasion vu depuis le cou, repère tête (cm)
const OFFSET = new THREE.Vector3(0, -0.6, 0.18);  // nasion → pont de la monture
const VERRE  = new THREE.Vector3(3.2, -0.6, 1.5); // centre d'un verre, repère tête
const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), 0);

let graine = 12345;
const alea = () => { graine = (graine*1664525+1013904223)>>>0; return graine/4294967296; };
const gauss = () => Math.sqrt(-2*Math.log(alea()+1e-12))*Math.cos(2*Math.PI*alea());

function verite(t, ampDeg, hz, axe){
  const a = ampDeg*Math.PI/180*Math.sin(2*Math.PI*hz*t);
  const q = new THREE.Quaternion().setFromAxisAngle(axe, a);
  const nas = NASION.clone().applyQuaternion(q).add(PIVOT);
  return { q, nas };
}
const ecran = v => ({ x: v.x*F_PX/(-v.z), y: v.y*F_PX/(-v.z) });

// Mesure réelle d'un suivi : ~0,08 cm sur x/y, 0,25 cm sur z, 0,35° de rotation.
function bruite(vq, vnas, sig){
  const e = new THREE.Euler((gauss()*sig.rot)*Math.PI/180,(gauss()*sig.rot)*Math.PI/180,(gauss()*sig.rot)*Math.PI/180);
  const q = vq.clone().multiply(new THREE.Quaternion().setFromEuler(e));
  return { q, nas: vnas.clone().add(new THREE.Vector3(gauss()*sig.xy, gauss()*sig.xy, gauss()*sig.z)) };
}

// ── A. La chaîne actuelle de la borne ────────────────────────────────
function chaineActuelle(){
  const Fx=new OneEuro(9,0.55), Fy=new OneEuro(9,0.55), Fz=new OneEuro(5,0.15);
  const Kx=new Kalman1D(0.010,0.003), Ky=new Kalman1D(0.010,0.003), Kz=new Kalman1D(0.006,0.002);
  const sq=new THREE.Quaternion(); let init=false;
  return (m, t) => {
    if(!init){ sq.copy(m.q); init=true; } else sq.slerp(m.q, 0.42);
    const o = OFFSET.clone().applyQuaternion(sq);
    const x=Kx.update(Fx.f(m.nas.x+o.x,t)), y=Ky.update(Fy.f(m.nas.y+o.y,t)), z=Kz.update(Fz.f(m.nas.z+o.z,t));
    return { q: sq.clone(), pos: new THREE.Vector3(x,y,z) };
  };
}

// ── B. Une seule pose, un seul rythme ────────────────────────────────
// Position ET rotation partagent le même coefficient, calculé sur la
// vitesse angulaire de la tête : au repos on lisse fort (plus de
// tremblement), en mouvement on suit presque brut. Comme les deux ont le
// même retard, la monture ne glisse plus par rapport au visage.
function chainePartagee(p={}){
  const aMin=p.aMin??0.30, aMax=p.aMax??0.95, vRef=p.vRef??(p.vRefDeg??60)*Math.PI/180;
  const lead=p.lead??0;                         // prédiction (secondes)
  let sq=null, sp=null, prevQ=null, vel=new THREE.Vector3(), w=0;
  return (m, t) => {
    const brutPos = m.nas.clone().add(OFFSET.clone().applyQuaternion(m.q));
    if(!sq){ sq=m.q.clone(); sp=brutPos.clone(); prevQ=m.q.clone(); return { q:sq.clone(), pos:sp.clone() }; }
    const dt=1/FPS;
    const ang = 2*Math.acos(Math.min(1,Math.abs(prevQ.dot(m.q))));
    w = 0.5*w + 0.5*(ang/dt);                    // vitesse angulaire lissée (rad/s)
    prevQ.copy(m.q);
    const a = Math.min(aMax, aMin + (aMax-aMin)*(w/vRef));
    const avant = sp.clone();
    sq.slerp(m.q, a);
    sp.lerp(brutPos, a);
    let pos = sp.clone(), q = sq.clone();
    if(lead>0){                                   // extrapolation courte, bornée
      const v = sp.clone().sub(avant).multiplyScalar(1/dt);
      pos.add(v.multiplyScalar(Math.min(lead,0.04)));
    }
    return { q, pos };
  };
}

// ── Essai ────────────────────────────────────────────────────────────
function essai(nom, fabrique, {amp,hz,axe,bruit,dur=8}){
  graine = 12345;
  const filtre = fabrique();
  const erreurs = [], angles=[];
  const n = dur*FPS;
  for(let i=0;i<n;i++){
    const t=i/FPS, tm=t*1000;
    const v = verite(t,amp,hz,axe);
    const m = bruite(v.q, v.nas, bruit);
    const r = filtre(m, tm);
    // Où est le centre du verre : réel contre affiché.
    const vraiPos = v.nas.clone().add(OFFSET.clone().applyQuaternion(v.q));
    const reel = VERRE.clone().applyQuaternion(v.q).add(vraiPos);
    const rendu = VERRE.clone().applyQuaternion(r.q).add(r.pos);
    const a=ecran(reel), b=ecran(rendu);
    if(t>1){ erreurs.push(Math.hypot(a.x-b.x,a.y-b.y));
             angles.push(2*Math.acos(Math.min(1,Math.abs(v.q.dot(r.q))))*180/Math.PI); }
  }
  const moy=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const tri=[...erreurs].sort((x,y)=>x-y);
  return { nom, moy:moy(erreurs), p95:tri[Math.floor(tri.length*0.95)], max:tri[tri.length-1], ang:moy(angles) };
}

const X = new THREE.Vector3(1,0,0), Y = new THREE.Vector3(0,1,0);
const bruit = { xy:0.08, z:0.25, rot:0.35 };
const cas = [
  { nom:'hochement lent    (±10°, 0,5 Hz)', amp:10, hz:0.5, axe:X },
  { nom:'hochement normal  (±15°, 0,8 Hz)', amp:15, hz:0.8, axe:X },
  { nom:'hochement vif     (±20°, 1,5 Hz)', amp:20, hz:1.5, axe:X },
  { nom:'« non » de la tête (±30°, 0,8 Hz)', amp:30, hz:0.8, axe:Y },
  { nom:'immobile, tremblement seul',        amp:0,  hz:0.5, axe:X },
];
const variantes = [
  ['actuelle                ', chaineActuelle],
  ['partagée                ', () => chainePartagee()],
  ['partagée + avance 25 ms ', () => chainePartagee({lead:0.025})],
];
const sortie = [];
for(const c of cas){
  console.log('\n'+c.nom);
  for(const [nom,f] of variantes){
    const r = essai(nom,f,{...c,bruit});
    sortie.push({cas:c.nom,...r});
    console.log(`  ${nom} glissement moyen ${r.moy.toFixed(2)} px · 95% ${r.p95.toFixed(2)} px · pire ${r.max.toFixed(2)} px · angle ${r.ang.toFixed(2)}°`);
  }
}
module.exports = { essai, chaineActuelle, chainePartagee, cas, bruit };
