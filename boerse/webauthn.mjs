import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import {fail} from './security.mjs';
export function createWebAuthn(origin) {
  const rpID=new URL(origin).hostname;
  return {
    registrationOptions: ({id,username})=>generateRegistrationOptions({
      rpName:'Gugu Börse', rpID, userID:new TextEncoder().encode(id),
      userName:username, userDisplayName:'Gugu Börse member', attestationType:'none',
      authenticatorSelection:{residentKey:'required',userVerification:'required'},
      supportedAlgorithmIDs:[-7,-257],
    }),
    async verifyRegistration(response,challenge) {
      try {
        const result=await verifyRegistrationResponse({response,expectedChallenge:challenge,
          expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});
        if(!result.verified) throw fail();
        const c=result.registrationInfo.credential;
        if(c.id.length>1400 || c.publicKey.length>3000) throw fail();
        return {id:c.id, publicKey:Buffer.from(c.publicKey).toString('base64url'),
          counter:c.counter, transports:(c.transports??[]).filter(t=>['internal','usb','nfc','ble','hybrid','smart-card'].includes(t))};
      } catch {throw fail('Passkey verification failed. Please start again.',400);}
    },
    loginOptions: keys=>generateAuthenticationOptions({rpID,userVerification:'required',
      allowCredentials:keys.map(k=>({id:k.CREDENTIAL_ID,transports:JSON.parse(k.TRANSPORTS)}))}),
    async verifyLogin(response,challenge,key) {
      try {
        const expectedHandle=Buffer.from(key.REGISTRATION_ID).toString('base64url');
        if(response.response?.userHandle && response.response.userHandle!==expectedHandle) throw fail();
        const result=await verifyAuthenticationResponse({response,expectedChallenge:challenge,
          expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
          credential:{id:key.CREDENTIAL_ID,publicKey:new Uint8Array(Buffer.from(key.PUBLIC_KEY,'base64url')),
            counter:Number(key.SIGN_COUNT),transports:JSON.parse(key.TRANSPORTS)}});
        if(!result.verified) throw fail();
        return result.authenticationInfo.newCounter;
      } catch {throw fail('Passkey verification failed. Please start again.',400);}
    },
  };
}
