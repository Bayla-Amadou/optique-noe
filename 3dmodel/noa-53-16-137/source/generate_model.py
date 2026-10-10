"""Photo-guided approximate NOA frame; requires numpy, scipy, matplotlib."""
from pathlib import Path
import numpy as np, json, struct, base64, zipfile
from scipy.interpolate import CubicSpline
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
OUT=Path(__file__).parent
parts=[]
mats=[('Black_front',[.025,.029,.025,1],.05,.32),('Metal_temples',[.38,.39,.33,1],.85,.25),('Yellow_tips',[.8,.71,.06,1],0,.42),('Clear_lenses',[.74,.9,.94,.12],0,.08),('Clear_nosepads',[.84,.86,.78,.4],0,.35)]
def add(name,v,f,mat=0,parent=None):
 parts.append(dict(name=name,v=np.array(v,float),f=np.array(f,int),mat=mat,parent=parent))
def tube(name,points,r=1,mat=0,parent=None,closed=False,sides=10):
 p=np.asarray(points,float);v=[];f=[]
 for i,q in enumerate(p):
  t=p[(i+1)%len(p)]-p[(i-1)%len(p)] if closed else p[min(i+1,len(p)-1)]-p[max(i-1,0)]
  t=t/np.linalg.norm(t);ref=np.array([0,0,1.]) if abs(t[2])<.85 else np.array([0,1.,0]);a=np.cross(t,ref);a/=np.linalg.norm(a);b=np.cross(t,a)
  for j in range(sides):v.append(q+r*(a*np.cos(j*2*np.pi/sides)+b*np.sin(j*2*np.pi/sides)))
 for i in range(len(p) if closed else len(p)-1):
  for j in range(sides):
   a=i*sides+j;b=i*sides+(j+1)%sides;c=((i+1)%len(p))*sides+j;d=((i+1)%len(p))*sides+(j+1)%sides;f.extend([[a,b,c],[b,d,c]])
 if not closed:
  for k in range(1,sides-1):f.extend([[0,k+1,k],[(len(p)-1)*sides,(len(p)-1)*sides+k,(len(p)-1)*sides+k+1]])
 add(name,v,f,mat,parent)
def path_spline(points,n=50):
 p=np.asarray(points);t=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))];return CubicSpline(t,p,axis=0)(np.linspace(0,t[-1],n))
def ellipsoid(name,c,r,mat):
 v=[];f=[]
 for i in range(13):
  a=np.pi*i/12
  for j in range(20):
   b=j*np.pi/10;v.append(np.array(c)+np.array(r)*[np.sin(a)*np.cos(b),np.cos(a),np.sin(a)*np.sin(b)])
 for i in range(12):
  for j in range(20):
   a=i*20+j;b=i*20+(j+1)%20;f.extend([[a,b,a+20],[b,b+20,a+20]])
 add(name,v,f,mat)
# Rounded rectangular silhouette, top flatter and bottom narrower, inferred from photos.
outline=np.array([[8,8,0],[20,11,0],[46,10,0],[60,7,0],[61,-6,0],[56,-21,0],[44,-26,0],[22,-25,0],[12,-18,0],[8,0,0],[8,8,0]],float)
outline[:,0]=8+(outline[:,0]-8)*53/53
rim=CubicSpline(np.arange(len(outline)),outline,bc_type='periodic')(np.linspace(0,len(outline)-1,112,endpoint=False))
# Lens opening width 53mm; overall outer front 140mm (tube radius included).
for sign,label in [(1,'L'),(-1,'R')]:
 p=rim.copy();p[:,0]*=sign;p[:,2]=-.0008*(abs(p[:,0])-8)**2
 tube('RIM_'+label,p,1.15,closed=True,sides=12)
 c=p.mean(axis=0);vl=np.vstack([c,p*.985+c*.015]);fl=[[0,i+1,(i+1)%len(p)+1] for i in range(len(p))];add('LENS_'+label,vl,fl,3)
 tube('ENDPIECE_'+label,path_spline([[sign*59,7,-2],[sign*64,7,-3],[sign*68.9,6,-5]]),1.1)
 pivot=np.array([sign*68,6,-5.]);
 metal=path_spline([[sign*68,6,-5],[sign*69,5,-15],[sign*70,4,-28],[sign*69,3,-45],[sign*68,2,-70],[sign*66,1,-92]])
 tube('TEMPLE_'+label,metal-pivot,.95,1,'PIVOT_'+label,sides=10)
 deco=path_spline([[sign*68,6.5,-13],[sign*69.5,5.5,-23],[sign*70,4,-36]])
 tube('TEMPLE_ACCENT_'+label,deco-pivot,.5,0,'PIVOT_'+label)
 tip=path_spline([[sign*66,1,-92],[sign*65,0,-111],[sign*63,-3,-125],[sign*60,-11,-137]])
 tube('TIP_'+label,tip-pivot,1.55,2,'PIVOT_'+label,sides=12)
 tube('PAD_ARM_'+label,path_spline([[sign*8,-2,0],[sign*10,-5,-5],[sign*11,-9,-8]]),.6,1)
 ellipsoid('NOSEPAD_'+label,[sign*11,-10,-8],[2.2,5,1.2],4)
tube('BRIDGE_CENTER_MESH',path_spline([[-8,0,0],[-4,2,1],[0,2.5,1.5],[4,2,1],[8,0,0]]),1.25)
tube('BROW_BAR',path_spline([[-15,10,0],[-8,10.5,.7],[0,10.5,1],[8,10.5,.7],[15,10,0]]),1.1)
anchors={'BRIDGE_CENTER':[0,0,0],'LENS_CENTER_L':[34.5,-7.5,-.56],'LENS_CENTER_R':[-34.5,-7.5,-.56],'HINGE_L':[68,6,-5],'HINGE_R':[-68,6,-5],'TEMPLE_END_L':[60,-11,-137],'TEMPLE_END_R':[-60,-11,-137],'FRAME_CENTER':[0,-7,0]}
# Move geometric midpoint of the bridge arch to origin.
for p in parts:
 if not p['parent']:p['v'][:,1]-=2.5
for n in anchors:
 anchors[n][1]-=2.5
anchors['BRIDGE_CENTER']=[0,0,0]
# glTF, metres, +X wearer-left, +Y up, +Z outward; arms extend into -Z.
g={'asset':{'version':'2.0','generator':'NOA approximate photo-guided reconstruction'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'NOA_FRAME_ROOT','children':[],'extras':{'prototype':True,'units':'meters','dimensions_mm':{'frameWidth':140,'lensWidth':53,'bridgeWidth':16,'templeLength':137},'inferred':['lensHeight','curvature','padGeometry','hingeGeometry'],'scaleReference':'phone measurement approx 140mm'}}], 'meshes':[],'materials':[],'accessors':[],'bufferViews':[],'buffers':[]}
for name,color,metal,rough in mats:
 m={'name':name,'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':metal,'roughnessFactor':rough},'doubleSided':True}
 if color[3]<1:m['alphaMode']='BLEND'
 g['materials'].append(m)
blob=bytearray()
def accessor(a,typ,component,target):
 a=np.ascontiguousarray(a);idx=len(g['bufferViews']);offset=len(blob);blob.extend(a.tobytes());blob.extend(b'\0'*((-len(blob))%4));g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes,'target':target});acc={'bufferView':idx,'componentType':component,'count':len(a),'type':typ}
 if typ=='VEC3':acc.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
 g['accessors'].append(acc);return len(g['accessors'])-1
parents={}
for label in ['L','R']:
 idx=len(g['nodes']);parents['PIVOT_'+label]=idx;g['nodes'].append({'name':'PIVOT_'+label,'translation':(np.array(anchors['HINGE_'+label])/1000).tolist(),'children':[]});g['nodes'][0]['children'].append(idx)
for part in parts:
 v=part['v']/1000;f=part['f'];norm=np.zeros_like(v);cross=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
 for k in range(3):np.add.at(norm,f[:,k],cross)
 norm/=np.maximum(np.linalg.norm(norm,axis=1,keepdims=True),1e-15)
 pos=accessor(v.astype('<f4'),'VEC3',5126,34962);nr=accessor(norm.astype('<f4'),'VEC3',5126,34962);indices=accessor(f.flatten().astype('<u4'),'SCALAR',5125,34963)
 mid=len(g['meshes']);g['meshes'].append({'name':part['name'],'primitives':[{'attributes':{'POSITION':pos,'NORMAL':nr},'indices':indices,'material':part['mat']}]});nid=len(g['nodes']);g['nodes'].append({'name':part['name'],'mesh':mid});g['nodes'][parents.get(part['parent'],0)]['children'].append(nid)
for name,point in anchors.items():
 nid=len(g['nodes']);g['nodes'].append({'name':name,'translation':(np.array(point)/1000).tolist()});g['nodes'][0]['children'].append(nid)
g['buffers']=[{'byteLength':len(blob)}];js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
(OUT/'noa_frame.glb').write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(blob))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
g['buffers'][0]['uri']='noa_frame.bin';(OUT/'noa_frame.gltf').write_text(json.dumps(g,indent=2));(OUT/'noa_frame.bin').write_bytes(blob)
# OBJ retains object separation, no pivots: rely on anchors.json for rigging.
obj=['# NOA approximate frame, metres','mtllib noa_frame.mtl'];count=1
for p in parts:
 vv=p['v'].copy()
 if p['parent']:vv+=np.array(anchors['HINGE_'+p['parent'][-1]])
 obj.extend(['o '+p['name'],'usemtl '+mats[p['mat']][0]])
 obj.extend('v '+' '.join(f'{q/1000:.8f}' for q in row) for row in vv)
 obj.extend('f '+' '.join(str(int(x)+count) for x in row) for row in p['f']);count+=len(vv)
(OUT/'noa_frame.obj').write_text('\n'.join(obj));(OUT/'noa_frame.mtl').write_text('\n'.join(f'newmtl {n}\nKd {c[0]} {c[1]} {c[2]}\nd {c[3]}\nNs 60\n' for n,c,_,_ in mats))
(OUT/'anchors.json').write_text(json.dumps({'units':'meters','coordinateSystem':'+X wearer left, +Y up, +Z outward; temples -Z','anchors':{n:(np.array(v)/1000).tolist() for n,v in anchors.items()}},indent=2))
fig=plt.figure(figsize=(13,5.5),facecolor='#f5f4ef')
for col,(elev,azim,title) in enumerate([(90,-90,'Façade'),(24,-63,'Vue 3/4')],1):
 ax=fig.add_subplot(1,2,col,projection='3d');ax.set_facecolor('#f5f4ef')
 for p in parts:
  v=p['v'].copy()
  if p['parent']:v+=np.array(anchors['HINGE_'+p['parent'][-1]])
  # map front plane XY to plot XY, depth Z.
  c=mats[p['mat']][1];poly=Poly3DCollection(v[p['f']],facecolors=[c],edgecolors='none');ax.add_collection3d(poly)
 ax.set_xlim(-80,80);ax.set_ylim(-40,25);ax.set_zlim(-145,10);ax.set_box_aspect((160,65,155));ax.view_init(elev,azim);ax.set_axis_off();ax.set_title(title,fontsize=14)
fig.suptitle('N.O.A · Monture 53–16–137 · Prototype approximatif',fontsize=18);fig.savefig(OUT/'apercu_monture.png',dpi=150,bbox_inches='tight');plt.close(fig)
print(json.dumps({'meshes':len(parts),'triangles':sum(len(p['f']) for p in parts),'glb_bytes':(OUT/'noa_frame.glb').stat().st_size,'nodes':len(g['nodes'])}))
# Integration-specific asset: one Front, two lenses, two pivoted temples, Pads.
import copy
h=copy.deepcopy(g);h['buffers']=[{'byteLength':len(blob)}];h['nodes']=[{'name':'NOA_FRAME_ROOT','children':[],'extras':g['nodes'][0]['extras']}];h['meshes']=[]
groups={'Front':[p['name'] for p in parts if p['mat']==0 and not p['parent']],'L_Lens':['LENS_L'],'R_Lens':['LENS_R'],'L_Temple':['TEMPLE_L','TEMPLE_ACCENT_L','TIP_L'],'R_Temple':['TEMPLE_R','TEMPLE_ACCENT_R','TIP_R'],'Pads':['PAD_ARM_L','PAD_ARM_R','NOSEPAD_L','NOSEPAD_R']}
for name,names in groups.items():
 primitives=[]
 for mesh in g['meshes']:
  if mesh['name'] in names:primitives.extend(mesh['primitives'])
 mi=len(h['meshes']);h['meshes'].append({'name':name,'primitives':primitives});ni=len(h['nodes']);node={'name':name,'mesh':mi}
 if name.endswith('Temple'):node['translation']=(np.array(anchors['HINGE_'+name[0]])/1000).tolist()
 h['nodes'].append(node);h['nodes'][0]['children'].append(ni)
for name,point in anchors.items():
 ni=len(h['nodes']);h['nodes'].append({'name':name,'translation':(np.array(point)/1000).tolist()});h['nodes'][0]['children'].append(ni)
h['nodes'][0]['extras']['dimensions_mm']['lensHeight']=37
h['nodes'][0]['extras']['dimensionSources']={'lensWidth':'reported engraving 53','bridgeWidth':'reported engraving 16','templeLength':'reported engraving 137, path approximated','frameWidth':'phone AR estimate around 140','lensHeight':'photo estimate around 37; not measured'}
h['nodes'][0]['extras']['status']='PROTOTYPE_NOT_CALIPER_VALIDATED'
js=json.dumps(h,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
(OUT/'model.glb').write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(blob))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
fig=plt.figure(figsize=(4,3),dpi=100,facecolor='#f5f4ef');ax=fig.add_axes([0,0,1,1],projection='3d');ax.set_facecolor('#f5f4ef')
for p in parts:
 v=p['v'].copy()
 if p['parent']:v+=np.array(anchors['HINGE_'+p['parent'][-1]])
 ax.add_collection3d(Poly3DCollection(v[p['f']],facecolors=[mats[p['mat']][1]],edgecolors='none'))
ax.set_xlim(-76,76);ax.set_ylim(-35,20);ax.set_zlim(-140,5);ax.set_box_aspect((152,55,145));ax.view_init(40,-65);ax.set_axis_off();fig.savefig(OUT/'thumb.png',dpi=100);plt.close(fig)
