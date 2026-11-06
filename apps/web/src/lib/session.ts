import { cookies } from "next/headers";

export const SESSION_COOKIE = "llmlens_session";

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}
