import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getSupabaseAdmin } from '@/lib/supabase';

// Match NextAuth's default cookie naming (secure prefix on https) so existing
// sessions survive this config change.
const useSecureCookies =
  process.env.NEXTAUTH_URL?.startsWith('https://') ??
  process.env.NODE_ENV === 'production';

export const authOptions = {
  // The dashboard is embedded in a cross-site iframe (GoHighLevel), where
  // SameSite=Lax cookies are never sent. SameSite=None requires Secure.
  // CSRF exposure this opens up is handled by the origin check in middleware.js.
  cookies: {
    sessionToken: {
      name: `${useSecureCookies ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
  },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Request offline access so we get a refresh token for server-side calendar ops
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/calendar',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',   // force consent screen so refresh_token is always returned
        },
      },
    }),
  ],

  pages: {
    signIn: '/dashboard/login',
  },

  callbacks: {
    // Persist tokens in the JWT so getServerSideProps can use them
    async jwt({ token, account }) {
      if (account) {
        token.accessToken  = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt    = account.expires_at;
      }
      return token;
    },

    async session({ session, token }) {
      session.accessToken  = token.accessToken;
      session.refreshToken = token.refreshToken;
      return session;
    },

    // On every Google sign-in, upsert this person as a team member with fresh tokens
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true;

      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('team_members').upsert(
        {
          email: user.email,
          name:  user.name,
          google_access_token:  account.access_token,
          google_refresh_token: account.refresh_token,
          token_expires_at: account.expires_at
            ? new Date(account.expires_at * 1000).toISOString()
            : null,
          active: true,
        },
        { onConflict: 'email' }
      );

      if (error) console.error('[nextauth] upsert team_member error:', error);
      return true;
    },
  },
};

export default NextAuth(authOptions);
