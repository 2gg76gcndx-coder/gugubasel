import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebAuthn} from '../webauthn.mjs';
import {authenticator} from './authenticator.mjs';
import {origin} from './memory.mjs';
const webauthn=createWebAuthn(origin);
async function enrolled(){
 const a=authenticator(),options=await webauthn.registrationOptions({id:'registration-id',phone:'+41791234567'});
 const key=await webauthn.verifyRegistration(a.registration(options),options.challenge);
 return {a,key:{CREDENTIAL_ID:key.id,REGISTRATION_ID:'registration-id',PUBLIC_KEY:key.publicKey,SIGN_COUNT:0,TRANSPORTS:JSON.stringify(key.transports)}};
}
for(const [name,override] of [['wrong origin',{clientOrigin:'https://evil.example'}],['wrong RP ID',{rpID:'evil.example'}],['missing user verification',{uv:false}]]){
 test(`registration rejects ${name}`,async()=>{
  const a=authenticator(),options=await webauthn.registrationOptions({id:'id',phone:'+41791234567'});
  await assert.rejects(webauthn.verifyRegistration(a.registration(options,override),options.challenge));
 });
 test(`authentication rejects ${name}`,async()=>{
  const {a,key}=await enrolled(),options=await webauthn.loginOptions([key]);
  await assert.rejects(webauthn.verifyLogin(a.assertion(options,override),options.challenge,key));
 });
}
test('authentication rejects wrong challenge and user handle',async()=>{
 const {a,key}=await enrolled(),options=await webauthn.loginOptions([key]);
 await assert.rejects(webauthn.verifyLogin(a.assertion(options),'wrong-challenge',key));
 await assert.rejects(webauthn.verifyLogin(a.assertion(options,{handle:'different-user'}),options.challenge,key));
});
test('counter rollback rejected for authenticators with nonzero counters',async()=>{
 const {a,key}=await enrolled(),options=await webauthn.loginOptions([key]);key.SIGN_COUNT=5;
 await assert.rejects(webauthn.verifyLogin(a.assertion(options,{count:4}),options.challenge,key));
});
