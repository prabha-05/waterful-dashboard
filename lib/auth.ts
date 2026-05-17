import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const SHARED_USERNAME = process.env.APP_USERNAME ?? "";
const SHARED_PASSWORD = process.env.APP_PASSWORD ?? "";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!SHARED_USERNAME || !SHARED_PASSWORD) return null;
        const { email, password } = credentials as {
          email: string;
          password: string;
        };
        // Mobile browsers can sneak in trailing whitespace via autocomplete
        // and we lowercase the username to be tolerant of auto-capitalization.
        const usernameInput = (email ?? "").trim();
        const passwordInput = (password ?? "").trim();
        if (
          usernameInput.toLowerCase() !== SHARED_USERNAME.toLowerCase() ||
          passwordInput !== SHARED_PASSWORD
        ) {
          return null;
        }
        return { id: "shared", name: SHARED_USERNAME, email: SHARED_USERNAME };
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
});
