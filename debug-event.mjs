import 'dotenv/config';
const r = await fetch('https://vzp-gta5rp.com/api/events?limit=5&offset=0', { headers: { 'User-Agent': 'Mozilla/5.0' } });
const events = await r.json();
const e = events[0];
console.log('map field in list:', e.map);
console.log('serverName field:', e.serverName);
process.exit(0);
