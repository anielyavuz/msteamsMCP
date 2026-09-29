// Microsoft Entra sign-in (device code flow) and token management via MSAL (delegated permissions only).
//
// - The token cache lives in a local file readable only by the owner (0600, directory 0700).
// - Exactly one signed-in account is kept: a new login removes any other cached account.
// - Scopes requested = what the enabled tools need (see tools/index.mjs requiredScopes).

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { InteractionRequiredAuthError, LogLevel, PublicClientApplication } from "@azure/msal-node";

export class AuthError extends Error {
  name = "AuthError";
}

/** MSAL cache plugin that persists the serialized cache to a private file. */
function fileCachePlugin(path) {
  return {
    async beforeCacheAccess(ctx) {
      try {
        ctx.tokenCache.deserialize(await readFile(path, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    },
    async afterCacheAccess(ctx) {
      if (!ctx.cacheHasChanged) return;
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, ctx.tokenCache.serialize(), { mode: 0o600 });
      await chmod(path, 0o600);
    },
  };
}

/**
 * @param {{tenantId:string, clientId:string, tokenCachePath:string}} config
 * @param {string[]} scopes delegated Microsoft Graph scopes, e.g. ["User.Read", "Chat.Read"]
 */
export function createAuth(config, scopes) {
  const pca = new PublicClientApplication({
    auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}` },
    cache: { cachePlugin: fileCachePlugin(config.tokenCachePath) },
    system: { loggerOptions: { logLevel: LogLevel.Error, piiLoggingEnabled: false, loggerCallback() {} } },
  });
  const cache = pca.getTokenCache();

  async function account() {
    const accounts = await cache.getAllAccounts();
    if (accounts.length > 1) throw new AuthError("More than one account in the token cache; run logout, then login");
    return accounts[0];
  }

  return {
    scopes,

    /** Device code sign-in. onCode({verificationUri, userCode, message, expiresIn}) shows the code to the user. */
    async login(onCode) {
      const result = await pca.acquireTokenByDeviceCode({ scopes, deviceCodeCallback: onCode });
      for (const other of await cache.getAllAccounts()) {
        if (other.homeAccountId !== result.account?.homeAccountId) await cache.removeAccount(other);
      }
      return result;
    },

    /** Access token for Microsoft Graph (refreshed silently from the cached refresh token). */
    async getAccessToken() {
      const acc = await account();
      if (!acc) throw new AuthError("Not signed in. Run: npm run login");
      try {
        return (await pca.acquireTokenSilent({ scopes, account: acc })).accessToken;
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) {
          throw new AuthError("Sign-in expired or new permissions are required. Run: npm run login");
        }
        throw e;
      }
    },

    /** Signed-in user name from the cache (no network call); undefined when signed out. */
    async username() {
      try {
        return (await account())?.username;
      } catch {
        return undefined;
      }
    },

    /** Status incl. granted scopes and token expiry (performs a silent token acquisition). */
    async status() {
      const acc = await account();
      if (!acc) return { signedIn: false };
      try {
        const r = await pca.acquireTokenSilent({ scopes, account: acc });
        return {
          signedIn: true,
          username: acc.username,
          name: acc.name,
          tenantId: acc.tenantId,
          clientId: config.clientId,
          grantedScopes: r.scopes,
          accessTokenExpiresOn: r.expiresOn?.toISOString(),
        };
      } catch (e) {
        return { signedIn: false, username: acc.username, reason: e.errorCode || e.message };
      }
    },

    /** Remove every cached account and delete the cache file. */
    async logout() {
      for (const acc of await cache.getAllAccounts()) await cache.removeAccount(acc);
      await rm(config.tokenCachePath, { force: true });
    },
  };
}
