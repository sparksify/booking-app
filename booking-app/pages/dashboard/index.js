import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';

// /dashboard → redirect to analytics (the intelligence home screen)
export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return { redirect: { destination: '/dashboard/login', permanent: false } };
  return { redirect: { destination: '/dashboard/analytics', permanent: false } };
}

export default function DashboardIndex() { return null; }
