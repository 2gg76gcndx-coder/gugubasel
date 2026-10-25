async function request(resource, data) {
  const root = `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/`;
  const auth = Buffer.from(`${process.env.TWILIO_API_KEY}:${process.env.TWILIO_API_SECRET}`).toString('base64');
  const response = await fetch(root+resource, {method:'POST', headers:{Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(data), signal:AbortSignal.timeout(12000)});
  const result = await response.json();
  if(!response.ok) { const e=new Error('Verification unavailable or expired. Please try again later.'); e.status=400; throw e; }
  return result;
}
export const send = to => request('Verifications', {To:to, Channel:'sms'});
export const verify = (sid, code) => request('VerificationCheck', {VerificationSid:sid, Code:code});
