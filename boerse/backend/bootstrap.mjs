// Run privately on the backend host, once, after schema.sql.
import {randomUUID} from 'node:crypto';
import {transaction} from './oracle.mjs';
import {phone,text} from './security.mjs';
const p=phone(process.argv[2]), name=text(process.argv[3],80);
await transaction(async db=>{
  if(await db.one("SELECT id FROM gb_members WHERE role='admin' FETCH FIRST 1 ROW ONLY")) throw new Error('An administrator already exists. Bootstrap refused.');
  await db.run("INSERT INTO gb_members(id,phone,display_name,role,status) VALUES (:id,:p,:name,'admin','active')",{id:randomUUID(),p,name});
});
console.log('Admin approved. Sign in on the Borse page with your phone and SMS code.');
process.exit(0);
