"""Extract a compact, attributed Westminster dataset from the Geofabrik OSM PBF.
Run with pyosmium installed. Source stays outside the web bundle.
"""
import osmium, json, math, sys
from pathlib import Path
WEST,SOUTH,EAST,NORTH=-.149,51.487,-.096,51.518
ORIGIN_LON,ORIGIN_LAT=-.1246,51.5007
SX=111320*math.cos(math.radians(ORIGIN_LAT));SZ=111320

def project(lon,lat):return [round((lon-ORIGIN_LON)*SX-121,2),round(-(lat-ORIGIN_LAT)*SZ-51,2)]
def inside(lon,lat):return WEST<lon<EAST and SOUTH<lat<NORTH
KEEP={'name','building','building:part','height','min_height','building:levels','roof:height','roof:shape','roof:material','building:material','building:colour','roof:colour','amenity','historic','leisure','landuse','natural','water','waterway','highway','width','lanes','surface','bridge','tunnel','layer','oneway','ref'}
def tags(o):return {t.k:t.v for t in o.tags if t.k in KEEP}
class London(osmium.SimpleHandler):
 def __init__(self):
  super().__init__();self.buildings=[];self.roads=[];self.areas=[];self.trees=[]
 def node(self,n):
  if inside(n.lon,n.lat) and n.tags.get('natural')=='tree':self.trees.append(project(n.lon,n.lat))
 def way(self,w):
  typ=w.tags.get('highway')
  if not typ or typ in ('construction','proposed'):return
  coords=[(n.lon,n.lat) for n in w.nodes if n.location.valid()]
  if len(coords)<2 or not any(inside(*p) for p in coords):return
  self.roads.append({'id':w.id,'t':tags(w),'p':[project(*p) for p in coords]})
 def area(self,a):
  building=a.tags.get('building') or a.tags.get('building:part')
  water=a.tags.get('natural')=='water' or a.tags.get('waterway')=='riverbank'
  green=a.tags.get('leisure') in ('park','garden','pitch') or a.tags.get('landuse') in ('grass','forest','meadow','recreation_ground') or a.tags.get('natural') in ('wood','scrub','grassland')
  if not (building or water or green):return
  polygons=[]
  for outer in a.outer_rings():
   coords=[(n.lon,n.lat) for n in outer if n.location.valid()]
   if len(coords)<4 or not any(inside(*p) for p in coords):continue
   holes=[]
   for inner in a.inner_rings(outer):holes.append([project(n.lon,n.lat) for n in inner if n.location.valid()])
   polygons.append([[project(*p) for p in coords]]+holes)
  if not polygons:return
  entry={'id':('w' if a.from_way() else 'r')+str(a.orig_id()),'t':tags(a),'p':polygons}
  (self.buildings if building else self.areas).append(entry)

h=London();h.apply_file(sys.argv[1],locations=True,idx='flex_mem')
out={'source':{'name':'OpenStreetMap contributors','url':'https://www.openstreetmap.org/copyright','license':'ODbL-1.0','extract':'Geofabrik Greater London','extract_url':'https://download.geofabrik.de/europe/united-kingdom/england/greater-london.html','projection':{'origin':[-.1246,51.5007],'origin_scene':[-121,-51],'metres_per_degree':[SX,SZ]},'bbox':[WEST,SOUTH,EAST,NORTH]},'buildings':h.buildings,'roads':h.roads,'areas':h.areas,'trees':h.trees}
Path(sys.argv[2]).write_text(json.dumps(out,separators=(',',':')))
print(json.dumps({k:len(out[k]) for k in ['buildings','roads','areas','trees']}),flush=True)
for b in h.buildings:
 if b['t'].get('name') in ['Palace of Westminster','County Hall','Westminster Abbey','Elizabeth Tower']:print(b['t'],b['p'][0][0][:3])
