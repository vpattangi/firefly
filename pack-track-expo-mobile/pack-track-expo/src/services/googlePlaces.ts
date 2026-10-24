/** Google Places API (New) Nearby Search helper. Use a server-side proxy in production. */
export type PlaceHours = { weekdayDescriptions?: string[]; periods?: unknown[] };
export type NearbyBusiness = { id:string; name:string; location:{latitude:number;longitude:number}; hours?:PlaceHours };
export async function searchNearbyBusinesses(lat:number,lon:number,radius=1200):Promise<NearbyBusiness[]> {
 const key=process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
 if(!key||key==='replace_me') throw new Error('Configure Google Places API access before requesting live businesses.');
 const response=await fetch('https://places.googleapis.com/v1/places:searchNearby',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.location,places.regularOpeningHours'},body:JSON.stringify({includedTypes:['cafe','convenience_store','restaurant','store','supermarket','pharmacy'],maxResultCount:20,locationRestriction:{circle:{center:{latitude:lat,longitude:lon},radius}}})});
 if(!response.ok) throw new Error('Google Places request failed. Check API enablement, billing, key restrictions, and quota.');
 const data=await response.json();return (data.places||[]).map((p:any)=>({id:p.id,name:p.displayName?.text||'Unnamed business',location:p.location,hours:p.regularOpeningHours}));
}
