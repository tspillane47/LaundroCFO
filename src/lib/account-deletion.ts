import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { revokeQuickBooksToken, type QuickBooksConnectionRow } from "@/lib/quickbooks";
import { removePlaidItem, type PlaidConnectionRow } from "@/lib/plaid";
import { decryptTokenIfEncrypted } from "@/lib/tokenEncryption";

export type ConnectionRevokeFailure = {
  provider: "quickbooks" | "plaid";
  storeId: string;
  connectionId: string;
  error: string;
};

export type RevokeUserConnectionsResult = {
  quickbooksAttempted: number;
  plaidAttempted: number;
  failures: ConnectionRevokeFailure[];
};

export async function revokeUserExternalConnections(
  userId: string
): Promise<RevokeUserConnectionsResult> {
  const admin = createAdminSupabaseClient();
  const failures: ConnectionRevokeFailure[] = [];

  const [{ data: quickbooksRows, error: quickbooksError }, { data: plaidRows, error: plaidError }] =
    await Promise.all([
      admin.from("quickbooks_connections").select("*").eq("user_id", userId),
      admin.from("plaid_connections").select("*").eq("user_id", userId),
    ]);

  if (quickbooksError) {
    throw new Error(`Failed to load QuickBooks connections: ${quickbooksError.message}`);
  }

  if (plaidError) {
    throw new Error(`Failed to load Plaid connections: ${plaidError.message}`);
  }

  for (const row of quickbooksRows ?? []) {
    const connection = row as QuickBooksConnectionRow;
    const refreshToken = decryptTokenIfEncrypted(connection.refresh_token);

    if (!refreshToken) {
      continue;
    }

    try {
      await revokeQuickBooksToken(refreshToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[account-deletion] QuickBooks token revoke failed", {
        userId,
        storeId: connection.store_id,
        connectionId: connection.id,
        error: message,
      });
      failures.push({
        provider: "quickbooks",
        storeId: connection.store_id,
        connectionId: connection.id,
        error: message,
      });
    }
  }

  for (const row of plaidRows ?? []) {
    const connection = row as PlaidConnectionRow;
    const accessToken = decryptTokenIfEncrypted(connection.plaid_access_token);

    if (!accessToken) {
      continue;
    }

    try {
      await removePlaidItem(accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[account-deletion] Plaid item remove failed", {
        userId,
        storeId: connection.store_id,
        connectionId: connection.id,
        error: message,
      });
      failures.push({
        provider: "plaid",
        storeId: connection.store_id,
        connectionId: connection.id,
        error: message,
      });
    }
  }

  return {
    quickbooksAttempted: quickbooksRows?.length ?? 0,
    plaidAttempted: plaidRows?.length ?? 0,
    failures,
  };
}

export async function deleteUserAccount(userId: string): Promise<RevokeUserConnectionsResult> {
  const revokeResult = await revokeUserExternalConnections(userId);
  const admin = createAdminSupabaseClient();

  const { error: storesError } = await admin.from("stores").delete().eq("user_id", userId);
  if (storesError) {
    throw new Error(`Failed to delete user stores: ${storesError.message}`);
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    throw new Error(`Failed to delete user account: ${deleteUserError.message}`);
  }

  if (revokeResult.failures.length > 0) {
    console.warn("[account-deletion] account deleted with external revoke failures", {
      userId,
      failures: revokeResult.failures,
    });
  }

  return revokeResult;
}
