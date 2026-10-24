export type DailyHours = Record<string,{open:string;close:string}|null>;
export function isOpenNow(hours:DailyHours, now=new Date()):boolean {
 const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const entry=hours[days[now.getDay()]];
 if(!entry) return false;
 const mins=now.getHours()*60+now.getMinutes(); const [oh,om]=entry.open.split(':').map(Number); const [ch,cm]=entry.close.split(':').map(Number);
 const start=oh*60+om, end=ch*60+cm;
 // Supports hours that cross midnight.
 return end>=start ? mins>=start&&mins<end : mins>=start||mins<end;
}
