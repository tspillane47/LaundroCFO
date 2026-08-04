import "server-only";

const goTrueAdminUsersUrl = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return `${url}/auth/v1/admin/users`;
};

function getServiceRoleKey(): string {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return serviceKey;
}

type GoTrueAdminUsersResponse = {
  users?: { id: string; email?: string }[];
};

/**
 * Look up a LaundroCFO account by email via the GoTrue admin API.
 * Server-only — never call from client code or expose via a public RPC.
 */
export async function lookupAccountByEmail(
  email: string
): Promise<{ userId: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const serviceKey = getServiceRoleKey();
  const response = await fetch(
    `${goTrueAdminUsersUrl()}?page=1&per_page=10&filter=${encodeURIComponent(normalized)}`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error("Auth lookup failed");
  }

  const body = (await response.json()) as GoTrueAdminUsersResponse;
  const match = (body.users ?? []).find(
    (user) => user.email?.toLowerCase() === normalized
  );

  return match ? { userId: match.id } : null;
}

/** Resolve a user's email by id via the GoTrue admin API. Server-only. */
export async function lookupEmailByUserId(userId: string): Promise<string | null> {
  const serviceKey = getServiceRoleKey();
  const response = await fetch(`${goTrueAdminUsersUrl()}/${userId}`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as { email?: string };
  return body.email ?? null;
}
