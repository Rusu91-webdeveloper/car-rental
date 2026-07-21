import { getVercelOidcToken } from "@vercel/oidc";
import {
  readPrivateDocumentEnvironment,
  type PrivateDocumentEnvironment,
} from "./environment";

type Environment = Readonly<Record<string, string | undefined>>;
type OidcTokenResolver = () => Promise<string>;

/**
 * Vercel rotates OIDC credentials and exposes them through request context.
 * Resolve that credential before evaluating the fail-closed production checks;
 * the returned configuration stores only the availability boolean, never the token.
 */
export async function readRuntimePrivateDocumentEnvironment(
  env: Environment = process.env,
  resolveOidcToken: OidcTokenResolver = getVercelOidcToken,
): Promise<PrivateDocumentEnvironment> {
  let oidcToken = env.VERCEL_OIDC_TOKEN?.trim();

  if (!oidcToken && env.VERCEL) {
    try {
      oidcToken = (await resolveOidcToken()).trim();
    } catch {
      oidcToken = undefined;
    }
  }

  if (!oidcToken) return readPrivateDocumentEnvironment(env);

  return readPrivateDocumentEnvironment({
    ...env,
    VERCEL_OIDC_TOKEN: oidcToken,
  });
}
