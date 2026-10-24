export type DemoPerson={id:string;name:string;gender:string;destination:string;departureOffset:number;distance:number};
export const demoPeople:DemoPerson[]=[
 {id:'u2',name:'Alex (sample student)',gender:'Women',destination:'Downtown San Jose',departureOffset:4,distance:0.3},
 {id:'u3',name:'Jordan (sample student)',gender:'Women',destination:'King Library / Downtown',departureOffset:8,distance:0.6},
 {id:'u4',name:'Taylor (sample student)',gender:'Men',destination:'Downtown San Jose',departureOffset:3,distance:0.2}
];
export function findBuddyCandidates(people:DemoPerson[],gender:string,destination:string,departureOffset:number,maxDistanceMiles:number){
 const keywords=['downtown','diridon','south campus','student union','king library','san pedro'];
 const requested=destination.toLowerCase();
 return people.filter(p=>p.gender===gender).map(p=>{const overlap=keywords.some(k=>requested.includes(k)&&p.destination.toLowerCase().includes(k));const timeDifference=Math.abs(p.departureOffset-departureOffset);return {...p,overlap,timeDifference,score:(overlap?50:0)+Math.max(0,20-timeDifference)-p.distance*5};}).filter(p=>p.distance<=maxDistanceMiles&&p.timeDifference<=10).sort((a,b)=>b.score-a.score);
}
