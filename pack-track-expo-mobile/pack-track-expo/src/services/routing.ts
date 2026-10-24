import * as turf from '@turf/turf';
import type { Business } from '../data/demoData';
import { isOpenNow } from '../utils/openingHours';
export type Coord={latitude:number;longitude:number};
export type AlertZone={id:string;center:Coord;radius:number};
export type RouteOption={id:string;distance:number;duration:number;coordinates:Coord[];nearbyOpenBusinesses:number;businessesPerKm:number;blockedAhead:boolean;score:number};
const orsKey=process.env.EXPO_PUBLIC_ORS_API_KEY;
const toLonLat=(p:Coord):[number,number]=>[p.longitude,p.latitude];
export async function getRoutes(start:Coord,destination:string,alerts:AlertZone[]):Promise<RouteOption[]> {
 if(!orsKey||orsKey==='replace_me') throw new Error('Add EXPO_PUBLIC_ORS_API_KEY to your local .env file to calculate walking routes.');
 // Geocode destination through ORS; for production, validate/confirm the selected destination first.
 const geocode=await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${orsKey}&text=${encodeURIComponent(destination)}&size=1`);
 if(!geocode.ok) throw new Error('Destination lookup failed. Check your OpenRouteService key.');
 const geo=await geocode.json(); const dest=geo.features?.[0]?.geometry?.coordinates;
 if(!dest) throw new Error('Destination not found. Try a more specific address.');
 const response=await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson',{method:'POST',headers:{Authorization:orsKey,'Content-Type':'application/json'},body:JSON.stringify({coordinates:[toLonLat(start),dest],alternative_routes:{target_count:3,share_factor:0.6,weight_factor:1.4},instructions:false})});
 if(!response.ok) throw new Error('Walking route request failed. Check API quota and key permissions.');
 const json=await response.json();
 return (json.features||[]).map((f:any,i:number)=>{const coords:Coord[]=f.geometry.coordinates.map((c:number[])=>({longitude:c[0],latitude:c[1]})); const summary=f.properties.summary; const blockedAhead=alerts.some(a=>{const line=turf.lineString(coords.map(toLonLat));const center=turf.point(toLonLat(a.center));const nearest=turf.nearestPointOnLine(line,center,{units:'meters'});return Number(nearest.properties.dist||Infinity)<=a.radius;}); return {id:`route-${i+1}`,distance:summary.distance,duration:summary.duration,coordinates:coords,nearbyOpenBusinesses:0,businessesPerKm:0,blockedAhead,score:0};});
}
export function scoreRoute(route:RouteOption,businesses:Business[],now=new Date()):number {
 const line=turf.lineString(route.coordinates.map(toLonLat));
 const near=businesses.filter(b=>isOpenNow(b.hours,now)&&turf.pointToLineDistance(turf.point(toLonLat(b.point)),line,{units:'meters'})<=30);
 route.nearbyOpenBusinesses=near.length; route.businessesPerKm=near.length/Math.max(route.distance/1000,0.1);
 // Reject routes more than 25% longer than the shortest available option outside this scorer.
 // Alert-zone crossing receives a large penalty; caller should compare candidate distances too.
 return route.blockedAhead ? -1000 : route.businessesPerKm;
}
export function withinShortestRouteLimit(routes:RouteOption[],fraction=0.25):RouteOption[]{
 if(!routes.length)return [];const shortest=Math.min(...routes.map(r=>r.distance));return routes.filter(r=>r.distance<=shortest*(1+fraction));
}
