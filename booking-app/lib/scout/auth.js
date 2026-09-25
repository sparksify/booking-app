import crypto from 'crypto';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
export async function requireScoutUser(req,res){const session=await getServerSession(req,res,authOptions);if(!session){res.status(401).json({error:'Unauthorized'});return null;}return session;}
export function validCron(req){const secret=process.env.CRON_SECRET||'';const supplied=req.headers.authorization||'';if(!secret)return false;const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(supplied);return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);}
