import { type NextAuthOptions, getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";

// Company Google Workspace domain — internal staff sign in with Google,
// restricted to this domain only. Real access still comes from having a
// User row in our own database, not from Google alone: Google just proves
// *who* someone is (a real theboredmonkey.com employee), an admin still
// has to have already added them with a role and campaign assignments
// (see the "Team" admin page) before they can get in.
//
// Clients don't have a theboredmonkey.com Google account, so they keep
// signing in with email + password (CredentialsProvider below). To stop
// that path from becoming a backdoor around Google-only for staff, the
// credentials provider only ever succeeds for role CLIENT — an internal
// account's password (if it even has one) can't be used to log in.
const ALLOWED_DOMAIN = "theboredmonkey.com";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  // Without an explicit error page, NextAuth sends AccessDenied to its own
  // generic /api/auth/error screen instead of back to our login page.
  pages: { signIn: "/login", error: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // `hd` only pre-fills/nudges Google's account picker toward the
      // Workspace domain — it is not enforced by Google, so it does not
      // replace the server-side check below.
      authorization: { params: { hd: ALLOWED_DOMAIN, prompt: "select_account" } },
    }),
    CredentialsProvider({
      name: "Client email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        // Clients live in their own table now (see the Client model) — this
        // door only ever checks that table, so an internal account's
        // password (even if it somehow had one) can never log in here.
        const client = await prisma.client.findUnique({ where: { email: credentials.email.toLowerCase() } });
        if (!client) return null;
        const valid = await bcrypt.compare(credentials.password, client.passwordHash);
        if (!valid) return null;
        return { id: client.id, name: client.name, email: client.email, role: "CLIENT" };
      },
    }),
  ],
  callbacks: {
    // The real gate for Google sign-in. Credentials sign-in is already
    // fully validated (identity + password + role) inside authorize()
    // above, so there's nothing further to check here for that provider.
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.toLowerCase() ?? "";
      const hd = (profile as { hd?: string } | undefined)?.hd;
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`) || hd !== ALLOWED_DOMAIN) {
        return false; // not a company Google account
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      return Boolean(existing); // must already exist as a User with a role
    },
    async jwt({ token, user, account }) {
      // `user`/`account` are only populated on the initial sign-in.
      if (user && account?.provider === "google" && user.email) {
        // Google's own user.id is a Google account id, not ours — look up
        // our User row by email to get the real internal id/role/name.
        const dbUser = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
        }
      } else if (user && account?.provider === "credentials") {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role as Role;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
};

// Convenience wrapper for use in Server Components / Server Actions.
export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  return session.user as { id: string; name: string; email: string; role: Role };
}

export async function currentUser() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id: string; name: string; email: string; role: Role } | undefined) ?? null;
}
