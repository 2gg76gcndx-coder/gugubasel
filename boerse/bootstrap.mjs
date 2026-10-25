// Private operator action: promote the already registered owner's username once.
import {transaction} from './oracle.mjs';
import {repository} from './repository.mjs';
import {approveRegistration} from './service.mjs';
import {username} from './security.mjs';
const user=username(process.argv[2]);
await transaction(async db=>{
  const repo=repository(db);
  if(await repo.adminExists()) throw new Error('An administrator already exists. Bootstrap refused.');
  await approveRegistration(repo,user,{role:'admin'});
});
console.log('Existing self-registered account promoted to admin. Sign in with your passkey on the Borse page.');
process.exit(0);
