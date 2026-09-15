import { google } from 'googleapis';
import { context, oauthClient, seal, unseal, resultData, READ_SCOPE, productionOnly } from '@/lib/fccServer';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  try {
    if(req.method!=='GET') return res.status(405).end();
    productionOnly();
    const {db,owner}=await context(req,res);
    const state=unseal(String(req.query.state || ''));
    const nonce=req.cookies.fcc_oauth;
    if(!nonce || state.nonce!==nonce || state.owner!==owner || state.expires<Date.now() || typeof req.query.code!=='string') throw new Error('Invalid OAuth state');
    res.setHeader('Set-Cookie','fcc_oauth=; HttpOnly; SameSite=Lax; Path=/api/dashboard/fcc; Max-Age=0; Secure');
    const auth=oauthClient();
    const {tokens}=await auth.getToken(req.query.code);
    if(!tokens.refresh_token || !tokens.scope?.split(' ').includes(READ_SCOPE)) throw new Error('Read-only consent required');
    auth.setCredentials(tokens);
    const profile=(await google.gmail({version:'v1',auth}).users.getProfile({userId:'me'})).data;
    const mailbox=profile.emailAddress.toLowerCase();
    const existing=resultData(await db.from('fcc_mailboxes').select('mailbox_email').eq('owner_email',owner).maybeSingle());
    if(existing && existing.mailbox_email!==mailbox) return res.redirect('/dashboard/bookings?fcc=wrong_mailbox');
    resultData(await db.from('fcc_mailboxes').upsert({owner_email:owner,mailbox_email:mailbox,tokens_encrypted:seal(tokens),last_error:null,updated_at:new Date().toISOString()},{onConflict:'owner_email'}));
    res.redirect('/dashboard/bookings?fcc=connected');
  } catch {res.redirect('/dashboard/bookings?fcc=connection_failed');}
}
