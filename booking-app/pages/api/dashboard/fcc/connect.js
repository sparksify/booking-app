import crypto from 'crypto';
import { context, oauthClient, seal, READ_SCOPE, productionOnly } from '@/lib/fccServer';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  try {
    if(req.method!=='GET') return res.status(405).end();
    productionOnly();
    const {owner}=await context(req,res);
    const nonce=crypto.randomBytes(32).toString('base64url');
    const secure=new URL(process.env.NEXTAUTH_URL).protocol==='https:';
    res.setHeader('Set-Cookie',`fcc_oauth=${nonce}; HttpOnly; SameSite=Lax; Path=/api/dashboard/fcc; Max-Age=600${secure?'; Secure':''}`);
    res.redirect(oauthClient().generateAuthUrl({access_type:'offline',prompt:'consent select_account',scope:[READ_SCOPE],state:seal({owner,nonce,expires:Date.now()+600000})}));
  } catch(error) {res.status(error.status || 500).json({error:error.status?error.message:'Could not start the Gmail connection.'});}
}
