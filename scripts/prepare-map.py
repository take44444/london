"""Clip OSM geometry, derive the riverbanks, and retain measured heights."""
import json,sys,math
from shapely.geometry import Polygon,box,MultiPolygon,GeometryCollection,LineString
from shapely.ops import unary_union
from shapely import make_valid
from pathlib import Path
source=Path(sys.argv[1]);m=json.loads(source.read_text())
bounds=box(-2300,-2300,2300,2300)
def shape(polygons):
 out=[]
 for rings in polygons:
  try:
   g=make_valid(Polygon(rings[0],rings[1:]))
   if not g.is_empty:out.append(g)
  except Exception:pass
 return unary_union(out)
def polygons(g):
 if isinstance(g,Polygon):
  return [[[round(x,2),round(y,2)] for x,y in g.exterior.coords]]+[[[round(x,2),round(y,2)] for x,y in r.coords] for r in g.interiors]
 if hasattr(g,'geoms'):return [p for child in g.geoms for p in multi(child)]
 return []
def multi(g):
 if isinstance(g,Polygon):return [polygons(g)]
 if hasattr(g,'geoms'):return [p for child in g.geoms for p in multi(child)]
 return []
waters=[shape(m['water'])] if m.get('water') else []
for a in m['areas']:
 if a['t'].get('water')=='river' or a['t'].get('waterway')=='riverbank':waters.append(shape(a['p']))
river=unary_union(waters).intersection(bounds)
m['water']=multi(river)
m['ground']=multi(bounds.difference(river))
m['riverside']=multi(river.buffer(5).difference(river).intersection(bounds))
m['riverPath']=[]
for z in range(-2100,2101,50):
 cross=river.intersection(LineString([(-2300,z),(2300,z)]))
 lines=[cross] if cross.geom_type=='LineString' else list(cross.geoms) if hasattr(cross,'geoms') else []
 lines=[line for line in lines if line.geom_type=='LineString']
 if lines:
  main=max(lines,key=lambda line:line.length)
  if main.length>50:m['riverPath'].append([round(main.centroid.x,2),z])
for a in m['areas']:a['p']=multi(shape(a['p']).intersection(bounds))
m['areas']=[a for a in m['areas'] if a['p'] and not(a['t'].get('water')=='river' or a['t'].get('waterway')=='riverbank')]
for b in m['buildings']:
 g=shape(b['p']);b['area']=round(g.area,1)
 b['c']=[round(g.centroid.x,2),round(g.centroid.y,2)] if not g.is_empty else [9999,9999]
 if not g.is_empty:
  rect=g.minimum_rotated_rectangle
  if rect.geom_type=='Polygon' and rect.area>1 and g.area/rect.area>.84:
   b['roofRect']=[[round(x,2),round(y,2)] for x,y in list(rect.exterior.coords)[:4]]
m['buildings']=[b for b in m['buildings'] if b['area']>8 and math.hypot(*b['c'])<2000 and b['t'].get('building:part')not in ('roof','balcony','elevator','air_shaft')]
m['roads']=[r for r in m['roads'] if r['t'].get('highway')not in ('corridor','platform','steps') and r['t'].get('tunnel') not in ('yes','building_passage') and not r['t'].get('layer','0').startswith('-')]
m['trees']=[p for p in m['trees'] if math.hypot(*p)<1950]
m['source']['preparation']='Clipped river, ground and promenades; building areas below 8 square metres removed; structures and trees kept within two kilometres of the origin.'
source.write_text(json.dumps(m,separators=(',',':')))
print({k:len(m[k]) for k in ['buildings','roads','areas','trees','water','ground']})
