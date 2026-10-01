#!/usr/bin/env python3
"""Create H01 v7 plus three width-calibration heads with exported normals."""
import json,struct,math
from pathlib import Path
ROOT=Path(__file__).parent;SRC=ROOT/'H01_v6';raw=(SRC/'H01_v6.glb').read_bytes();jl=struct.unpack_from('<I',raw,12)[0];base_doc=json.loads(raw[20:20+jl]);bin0=20+jl+8;base_bin=raw[bin0:]
p=base_doc['meshes'][0]['primitives'][0];a=base_doc['accessors'][p['attributes']['POSITION']];bv=base_doc['bufferViews'][a['bufferView']];po=bv.get('byteOffset',0)+a.get('byteOffset',0);stride=bv.get('byteStride',12)
V0=[struct.unpack_from('<3f',base_bin,po+i*stride) for i in range(a['count'])];ia=base_doc['accessors'][p['indices']];ib=base_doc['bufferViews'][ia['bufferView']];io=ib.get('byteOffset',0)+ia.get('byteOffset',0);I=[struct.unpack_from('<I',base_bin,io+i*4)[0] for i in range(ia['count'])];F=list(zip(I[0::3],I[1::3],I[2::3]))
L0={k:tuple(v) for k,v in json.loads((SRC/'H01_v6_measurements.json').read_text())['landmarks_mm'].items()}
# Direct, visible eye-corner vertices after v6 pupil rebase.
L0.update({'EYE_INNER_L':V0[52],'EYE_OUTER_L':V0[61],'EYE_INNER_R':V0[1484],'EYE_OUTER_R':V0[1491]})
def box(V):return tuple(min(q[i] for q in V) for i in range(3)),tuple(max(q[i] for q in V) for i in range(3))
def normals(V):
 N=[[0.,0.,0.] for _ in V]
 for i,j,k in F:
  a,b,c=V[i],V[j],V[k];u=(b[0]-a[0],b[1]-a[1],b[2]-a[2]);w=(c[0]-a[0],c[1]-a[1],c[2]-a[2]);n=(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])
  for x in (i,j,k):N[x][0]+=n[0];N[x][1]+=n[1];N[x][2]+=n[2]
 return [tuple(x/(math.sqrt(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]) or 1) for x in q) for q in N]
def make(folder,ident,label,target_width=None):
 if target_width is None:V=list(V0);L=dict(L0)
 else:
  basew=box(V0)[1][0]-box(V0)[0][0];maxabs=max(abs(q[0]) for q in V0);c=target_width/basew-1
  def tx(x):return x*(1+c*(abs(x)/maxabs)**2)
  V=[(tx(x),y,z) for x,y,z in V0];w=box(V)[1][0]-box(V)[0][0];f=target_width/w;V=[(x*f,y,z) for x,y,z in V];L={n:((tx(q[0])*f,q[1],q[2]) if n!='HEAD_ORIGIN' else q) for n,q in L0.items()}
 N=normals(V);b=box(V);dims={'head_width':round(b[1][0]-b[0][0],2),'head_height':round(b[1][1]-b[0][1],2),'head_depth':round(b[1][2]-b[0][2],2),'ipd':round(abs(L['PUPIL_L'][0]-L['PUPIL_R'][0]),2),'ear_rest_above_tragus_L':round(L['EAR_REST_L'][1]-L['TRAGUS_L'][1],2),'ear_rest_above_tragus_R':round(L['EAR_REST_R'][1]-L['TRAGUS_R'][1],2)}
 d=json.loads(json.dumps(base_doc));binary=bytearray(base_bin)
 for i,q in enumerate(V):struct.pack_into('<3f',binary,po+i*stride,*q)
 # Append normals and register the core glTF semantic.
 while len(binary)%4:binary.append(0)
 no=len(binary)
 for q in N:binary.extend(struct.pack('<3f',*q))
 vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':no,'byteLength':len(N)*12,'target':34962});ai=len(d['accessors']);d['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(N),'type':'VEC3'});d['meshes'][0]['primitives'][0]['attributes']['NORMAL']=ai
 for node in d['nodes']:
  if node['name'] in L:node['translation']=list(L[node['name']]);node['extras']={'landmark_mm':list(L[node['name']])}
 d['asset']['generator']='H01 calibration head builder with exported vertex normals';d['asset']['extras']={'unit':'millimeter','axes':'X subject-left; Y up; Z front'};d['buffers'][0]['byteLength']=len(binary)
 j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((4-len(j)%4)%4);total=12+8+len(j)+8+len(binary);out=ROOT/folder;out.mkdir(exist_ok=True)
 (out/(folder+'.glb')).write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
 meta={'id':ident,'name':label,'version':'1.0' if ident!='H01' else '7.0','unit':'millimeter','coordinate_system':{'origin':'midpoint_between_PUPIL_L_and_PUPIL_R','X':'subject_left','Y':'up','Z':'toward_face_front','handedness':'right_handed'},'facial_state':{'eyes':'open','gaze':'frontal','expression':'neutral','mouth':'closed','eyebrows':'present','hair':'none','makeup':'none','facial_hair':'none'},'dimensions_mm':dims,'landmarks_mm':{n:[round(x,6) for x in q] for n,q in L.items()},'derivation':{'mesh_source':'H01_v6.glb','method':'H01 v7 has direct eye-corner selections and normals. Calibration heads use a lateral morph that preserves central facial geometry while changing cranial/ear width.'}}
 (out/(folder+'_measurements.json')).write_text(json.dumps(meta,indent=2)+'\n')
 report=f"{ident} calibration validation\n\nNormals: {len(N)} exported vertex normals.\nMesh: {len(V)} vertices / {len(F)} triangles.\nHead width: {dims['head_width']} mm.\nIPD: {dims['ipd']} mm.\nLocators: {len(L)} named coordinates.\n"
 (out/'VALIDATION_REPORT.md').write_text(report);print(folder,dims)
make('H01_v7','H01','NOA Neutral Oval Reference')
make('H02_narrow_140mm','H02','Narrow calibration head — 140 mm',140.0)
make('H03_medium_155mm','H03','Medium calibration head — 155 mm',155.0)
make('H04_wide_190mm','H04','Wide calibration head — 190 mm',190.0)
