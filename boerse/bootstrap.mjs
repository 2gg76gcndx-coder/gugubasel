// Private operator action: approve the owner's exact pending passkey registration once.
import {transaction} from './oracle.mjs';
import {repository} from './repository.mjs';
import {approveRegistration} from './service.mjs';
import {reference} from './security.mjs';
const ref=reference(process.argv[2]);
await transaction(async db=>{
  const repo=repository(db);
  if(await repo.adminExists()) throw new Error('An administrator already exists. Bootstrap refused.');
  await approveRegistration(repo,ref,{role:'admin'});
});
console.log('Existing self-registered account promoted to admin. Sign in with your passkey on the Borse page.');
process.exit(0);
