import { documentError } from "../domain/errors";
export interface RecentAuthenticationVerifier {
  verify(input: {
    userId: string;
    authenticatedAt?: Date;
    maximumAgeMs: number;
  }): Promise<"RECENT" | "STALE" | "UNSUPPORTED">;
}
export class UnsupportedRecentAuthenticationVerifier implements RecentAuthenticationVerifier {
  async verify(): Promise<"UNSUPPORTED"> {
    return "UNSUPPORTED";
  }
}
export class FakeRecentAuthenticationVerifier implements RecentAuthenticationVerifier {
  constructor(private readonly now: () => Date = () => new Date()) {}
  async verify(input: {
    userId: string;
    authenticatedAt?: Date;
    maximumAgeMs: number;
  }): Promise<"RECENT" | "STALE"> {
    return input.authenticatedAt &&
      this.now().getTime() - input.authenticatedAt.getTime() <=
        input.maximumAgeMs
      ? "RECENT"
      : "STALE";
  }
}
export async function requireRecentAuthentication(
  verifier: RecentAuthenticationVerifier,
  input: { userId: string; authenticatedAt?: Date; maximumAgeMs: number },
) {
  if ((await verifier.verify(input)) !== "RECENT")
    documentError(
      "DOCUMENT_RECENT_AUTH_REQUIRED",
      "Recent authentication is required and unsupported for real downloads until a later phase.",
    );
}
