export type Business = { id:string; name:string; category:string; point:{latitude:number;longitude:number}; hours:Record<string,{open:string;close:string}|null> };
export const demoBusinesses: Business[] = [
 {id:'b1',name:'Student Union Café (sample)',category:'Cafe',point:{latitude:37.3357,longitude:-121.8853},hours:{Mon:{open:'08:00',close:'20:00'},Tue:{open:'08:00',close:'20:00'},Wed:{open:'08:00',close:'20:00'},Thu:{open:'08:00',close:'20:00'},Fri:{open:'08:00',close:'17:00'},Sat:null,Sun:null}},
 {id:'b2',name:'Downtown Market (sample)',category:'Market',point:{latitude:37.3372,longitude:-121.8840},hours:{Mon:{open:'07:00',close:'22:00'},Tue:{open:'07:00',close:'22:00'},Wed:{open:'07:00',close:'22:00'},Thu:{open:'07:00',close:'22:00'},Fri:{open:'07:00',close:'23:00'},Sat:{open:'09:00',close:'23:00'},Sun:{open:'09:00',close:'20:00'}}},
 {id:'b3',name:'Campus Bookstore (sample)',category:'Store',point:{latitude:37.3362,longitude:-121.8800},hours:{Mon:{open:'09:00',close:'17:00'},Tue:{open:'09:00',close:'17:00'},Wed:{open:'09:00',close:'17:00'},Thu:{open:'09:00',close:'17:00'},Fri:{open:'09:00',close:'17:00'},Sat:null,Sun:null}}
];
export const demoAlerts = [{id:'a1',center:{latitude:37.3370,longitude:-121.8820},radius:120}];
