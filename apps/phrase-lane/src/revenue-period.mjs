export function revenuePeriod(search, clock=Date.now()) {
 const p=new URLSearchParams(search);
 if([...p.keys()].some(k=>!['from','to'].includes(k))||p.getAll('from').length>1||p.getAll('to').length>1)throw new RangeError('Use one from and to date.');
 const from=p.get('from'),to=p.get('to');
 if(!from&&!to)return null;
 function parse(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw new RangeError('Use YYYY-MM-DD dates.');const utc=Date.parse(day+'T00:00:00Z');if(!Number.isFinite(utc)||new Date(utc).toISOString().slice(0,10)!==day)throw new RangeError('Invalid calendar date.');return utc-9*3600000;}
 const start=parse(from),end=parse(to)+86400000;
 if(end<=start||end-start>366*86400000||end>clock+2*86400000)throw new RangeError('Choose an ordered date range of at most 366 days, not in the future.');
 return {from,to,start,end,timeZone:'Asia/Tokyo'};
}
