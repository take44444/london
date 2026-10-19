"""Prepare a wider, simplified OSM context using the existing scene projection.
PYTHONPATH=/path/to/gis/packages python3 scripts/extract-region.py source.osm.pbf core.json output.json [radius]
"""
import json,math,sys,osmium
from pathlib import Path
from shapely.geometry import Polygon,box,LineString,Point
from shapely.strtree import STRtree
from shapely.ops import unary_union
from shapely import make_valid
core=json.loads(Path(sys.argv[2]).read_text());radius=float(sys.argv[4]) if len(sys.argv)>4 else 6000
projection=core['source']['projection'];lon0,lat0=projection['origin'];ox,oz=projection['origin_scene'];sx,sz=projection['metres_per_degree']
region=box(-radius-1000,-radius-1000,radius+1000,radius+1000)
KEEP={'name','building','building:part','height','min_height','building:levels','building:min_level','roof:height','roof:shape','roof:direction','roof:orientation','roof:angle','roof:levels','roof:material','building:material','building:colour','roof:colour','highway','width','lanes','bridge','tunnel','layer','natural','waterway','leisure','landuse'}
def project(lon,lat):return [round((lon-lon0)*sx+ox,2),round(-(lat-lat0)*sz+oz,2)]
def number(value,fallback=0):
 try:return float(str(value).split()[0])
 except (ValueError,IndexError):return fallback
def tags(o):return {t.k:t.v for t in o.tags if t.k in KEEP}
def polygons(g):
 if g.geom_type=='Polygon':return [[[[round(x,2),round(z,2)] for x,z in g.exterior.coords]]+[[[round(x,2),round(z,2)] for x,z in ring.coords] for ring in g.interiors if Polygon(ring).area>9]]
 if hasattr(g,'geoms'):return [p for child in g.geoms for p in polygons(child)]
 return []
class Context(osmium.SimpleHandler):
 def __init__(self):super().__init__();self.buildings=[];self.water=[];self.greens=[];self.roads=[];self.trees=[]
 def node(self,n):
  if n.tags.get('natural')=='tree':
   p=project(n.lon,n.lat)
   if 1950<math.hypot(*p)<radius:self.trees.append(p)
 def way(self,w):
  kind=w.tags.get('highway')
  if kind not in ('motorway','trunk','primary','secondary','tertiary','residential','unclassified','living_street','pedestrian'):return
  if w.tags.get('tunnel') in ('yes','building_passage') or w.tags.get('layer','0').startswith('-'):return
  points=[project(n.lon,n.lat) for n in w.nodes if n.location.valid()]
  if len(points)<2:return
  if max(p[0] for p in points)<-radius or min(p[0] for p in points)>radius or max(p[1] for p in points)<-radius or min(p[1] for p in points)>radius:return
  g=LineString(points).intersection(region)
  lines=[g] if g.geom_type=='LineString' else list(g.geoms) if hasattr(g,'geoms') else []
  for line in lines:
   if line.geom_type=='LineString' and line.length>3:self.roads.append({'id':w.id,'t':tags(w),'p':[[round(x,2),round(z,2)] for x,z in line.simplify(.6).coords]})
 def area(self,a):
  building=a.tags.get('building') or a.tags.get('building:part')
  water=a.tags.get('natural')=='water' or a.tags.get('waterway')=='riverbank'
  green=a.tags.get('leisure') in ('park','garden','pitch') or a.tags.get('landuse') in ('grass','forest','meadow','recreation_ground') or a.tags.get('natural') in ('wood','scrub','grassland')
  if not (building or water or green):return
  if building and (building=='no' or a.tags.get('building:part') in ('roof','balcony','elevator','air_shaft')):return
  shapes=[]
  for outer in a.outer_rings():
   points=[project(n.lon,n.lat) for n in outer if n.location.valid()]
   if len(points)<4 or max(p[0] for p in points)<-radius-1000 or min(p[0] for p in points)>radius+1000 or max(p[1] for p in points)<-radius-1000 or min(p[1] for p in points)>radius+1000:continue
   holes=[[project(n.lon,n.lat) for n in ring if n.location.valid()] for ring in a.inner_rings(outer)]
   g=make_valid(Polygon(points,[r for r in holes if len(r)>=4]))
   if not g.is_empty:shapes.append(g)
  if not shapes:return
  g=unary_union(shapes)
  if building:
   if (g.area<25 and not(g.area>=1 and max(number(a.tags.get('height')),number(a.tags.get('min_height')))>=35)) or math.hypot(g.centroid.x,g.centroid.y)>radius:return
   g=g.simplify(.35,preserve_topology=True);p=polygons(g)
   if not p:return
   b={'id':('w' if a.from_way() else 'r')+str(a.orig_id()),'t':tags(a),'p':p,'c':[round(g.centroid.x,2),round(g.centroid.y,2)],'area':round(g.area,1)}
   if a.tags.get('roof:shape') not in ('flat',None):
    rect=g.minimum_rotated_rectangle
    if rect.geom_type=='Polygon' and rect.area>1 and (g.area/rect.area>.84 or a.tags.get('roof:shape') in ('skillion','shed')):b['roofRect']=[[round(x,2),round(z,2)] for x,z in list(rect.exterior.coords)[:4]]
   self.buildings.append(b)
  else:
   g=g.intersection(region).simplify(1.2,preserve_topology=True)
   if g.is_empty:return
   (self.water if water else self.greens).extend(polygons(g))
h=Context();h.apply_file(sys.argv[1],locations=True,idx='flex_mem')
# Avoid filling complete mapped 3D parts with a duplicate enclosing shell.
parts=[b for b in h.buildings if b['t'].get('building:part') not in (None,'no')]
part_shapes=[unary_union([Polygon(p[0],p[1:]) for p in b['p']]) for b in parts]
tree=STRtree([Point(b['c']) for b in parts]);removed=[]
for b in h.buildings:
 if b['t'].get('building:part') not in (None,'no'):continue
 g=unary_union([Polygon(p[0],p[1:]) for p in b['p']]);candidates=[int(i) for i in tree.query(g,predicate='covers') if parts[int(i)]['area']<=b['area']*1.2]
 if not candidates:continue
 base=number(b['t'].get('min_height'));covered=base
 ranges=sorted((number(parts[i]['t'].get('min_height')),number(parts[i]['t'].get('height'),number(parts[i]['t'].get('building:levels'))*3.55)) for i in candidates)
 for low,high in ranges:
  if low>covered+2.5:break
  covered=max(covered,high)
 height=number(b['t'].get('height'),number(b['t'].get('building:levels'))*3.55)
 if covered<max(height,base+2):continue
 projected=unary_union([part_shapes[i] for i in candidates]).intersection(g).area
 if projected/max(g.area,1)>.92:removed.append(b['id'])
removed_set=set(removed);h.buildings=[b for b in h.buildings if b['id'] not in removed_set]
river=unary_union([Polygon(p[0],p[1:]) for p in h.water]);corebox=box(-2300,-2300,2300,2300)
land=region.difference(river).difference(corebox);water=river.difference(corebox)
greens=unary_union([Polygon(p[0],p[1:]) for p in h.greens]).difference(corebox)
roadlist=[]
for r in h.roads:
 g=LineString(r['p']).difference(corebox);lines=[g] if g.geom_type=='LineString' else list(g.geoms) if hasattr(g,'geoms') else []
 for line in lines:
  if line.geom_type=='LineString' and line.length>3:roadlist.append({**r,'p':[[round(x,2),round(z,2)] for x,z in line.coords]})
out={'source':{'name':'OpenStreetMap contributors','license':'ODbL-1.0','url':'https://www.openstreetmap.org/copyright','extract':'Geofabrik Greater London','extract_url':core['source']['extract_url'],'projection':projection,'radius':radius,'simplification_metres':.35,'suppressed_envelopes':len(removed)},'buildings':h.buildings,'land':polygons(land),'water':polygons(water),'greens':polygons(greens),'roads':roadlist,'trees':h.trees}
Path(sys.argv[3]).write_text(json.dumps(out,separators=(',',':')))
print({k:len(out[k]) for k in ['buildings','land','water','greens','roads','trees']},flush=True)
for b in h.buildings:
 if b['t'].get('name') in ("St Paul's Cathedral",'The Shard','30 St Mary Axe','20 Fenchurch Street'):print(b['id'],b['t'],b['c'],flush=True)
