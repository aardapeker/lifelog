/*
 * What the earthquake page needs besides the feed item: where it was (from the item's geo link),
 * what the magnitude means in plain words, and the map as a small Leaflet page for a WebView
 * (OpenStreetMap data, CARTO's dark tiles: free, no key). No React Native in here.
 */

export type Spot = { lat: number; lon: number; depth: number | null };
export type Dot = { lat: number; lon: number; mag: number; label: string };

/** "geo:40.85,27.95?depth=9.8" → the spot (the QUAKE item's mediaUrl). */
export function parseGeo(geo: string | null): Spot | null {
  const m = geo?.match(/^geo:(-?[\d.]+),(-?[\d.]+)(?:\?depth=(-?[\d.]+))?/);
  return m ? { lat: Number(m[1]), lon: Number(m[2]), depth: m[3] != null ? Number(m[3]) : null } : null;
}

/** Roughly what people feel at the epicentre, by magnitude. */
export function meaning(mag: number): string {
  if (mag < 3) return 'Usually not felt, only instruments notice it.';
  if (mag < 4) return 'Often felt nearby as a short shake; no damage.';
  if (mag < 5) return 'Felt by most people nearby; things rattle, damage is unlikely.';
  if (mag < 6) return 'Strong shaking nearby; weak buildings can be damaged.';
  if (mag < 7) return 'Strong earthquake: damage likely in populated areas close by.';
  return 'Major earthquake: serious damage over a wide area.';
}

const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c'); // safe inside <script>
/** Place names go into the map's HTML (popups, the Istanbul label), so they're escaped. */
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The map page: the quake pulsing, smaller dots for others nearby, Istanbul with a dashed line to it. */
export function mapHtml(q: { lat: number; lon: number; mag: number }, others: Dot[], home: { lat: number; lon: number; label: string }): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;height:100%;background:#1b1a1a}
.leaflet-control-attribution{background:rgba(0,0,0,.45)!important;color:#aaa!important;font-size:9px}
.leaflet-control-attribution a{color:#ccc!important}
.pulse{width:22px;height:22px;border-radius:50%;background:#ff5a4e;box-shadow:0 0 0 0 rgba(255,90,78,.7);animation:p 1.8s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 rgba(255,90,78,.7)}70%{box-shadow:0 0 0 26px rgba(255,90,78,0)}100%{box-shadow:0 0 0 0 rgba(255,90,78,0)}}
.home{font:600 11px sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:3px 7px;border-radius:9px;white-space:nowrap}
</style></head><body><div id="map"></div><script>
var q=${json(q)},others=${json(others.map((o) => ({ ...o, label: esc(o.label) })))},home=${json({ ...home, label: esc(home.label) })};
var map=L.map('map',{zoomControl:false,attributionControl:true});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:18,subdomains:'abcd',
 attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(map);
others.forEach(function(o){L.circleMarker([o.lat,o.lon],{radius:3+o.mag*1.6,color:'#ffb347',weight:1,fillOpacity:.35}).bindPopup(o.label).addTo(map)});
L.circle([q.lat,q.lon],{radius:Math.pow(10,0.43*q.mag)*1000/4,color:'#ff5a4e',weight:1,fillOpacity:.08}).addTo(map);
L.marker([q.lat,q.lon],{icon:L.divIcon({className:'',html:'<div class="pulse"></div>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);
L.polyline([[home.lat,home.lon],[q.lat,q.lon]],{color:'#fff',weight:1.5,dashArray:'5 6',opacity:.7}).addTo(map);
L.circleMarker([home.lat,home.lon],{radius:4,color:'#fff',weight:2,fillColor:'#fff',fillOpacity:1}).addTo(map);
L.marker([home.lat,home.lon],{icon:L.divIcon({className:'',html:'<div class="home">'+home.label+'</div>',iconSize:null,iconAnchor:[-8,10]})}).addTo(map);
map.fitBounds(L.latLngBounds([[q.lat,q.lon],[home.lat,home.lon]]).pad(0.35),{maxZoom:9});
</script></body></html>`;
}
