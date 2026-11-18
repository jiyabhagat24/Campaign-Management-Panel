// Shared test setup: an in-memory Prisma, a switchable signed-in user, and a
// no-op revalidatePath. Module mocks need Node's --experimental-test-module-mocks.
import { mock } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createFakePrisma } from "./fakePrisma";

export const fake = createFakePrisma();
(globalThis as any).prisma = fake; // src/lib/prisma.ts reuses globalThis.prisma

export const session: { user: { id: string; name: string; email: string; role: string } | null } = { user: null };
export function signIn(id: string) {
  const u = fake._db.users.find((x: any) => x.id === id);
  session.user = { id: u.id, name: u.name, email: `${u.id}@example.test`, role: u.role };
}

const authUrl = pathToFileURL(path.resolve("src/lib/auth.ts")).href;
mock.module(authUrl, {
  namedExports: {
    requireUser: async () => {
      if (!session.user) throw new Error("UNAUTHENTICATED");
      return session.user;
    },
    currentUser: async () => session.user,
  },
});
mock.module("next/cache", { namedExports: { revalidatePath: () => {}, revalidateTag: () => {} } });
