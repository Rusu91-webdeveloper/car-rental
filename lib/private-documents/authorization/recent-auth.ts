import { documentError } from "../domain/errors";

export interface RecentAuthenticationEvidence {
  provider: "google";
  authenticatedAt: Date;
  serverVerified: true;
}

export type RecentAuthenticationResult =
  | "RECENT"
  | "EXPIRED"
  | "MISSING"
  | "PROVIDER_UNAVAILABLE";

export interface RecentAuthenticationVerifier {
  verify(input: {
    userId: string;
    evidence?: RecentAuthenticationEvidence;
    maximumAgeMs: number;
  }): Promise<RecentAuthenticationResult>;
}

export class ServerSessionRecentAuthenticationVerifier implements RecentAuthenticationVerifier {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async verify(input: {
    userId: string;
    evidence?: RecentAuthenticationEvidence;
    maximumAgeMs: number;
  }): Promise<RecentAuthenticationResult> {
    if (!input.evidence?.serverVerified) return "MISSING";
    if (input.evidence.provider !== "google") return "PROVIDER_UNAVAILABLE";
    const age = this.now().getTime() - input.evidence.authenticatedAt.getTime();
    if (!Number.isFinite(age) || age < -60_000) return "MISSING";
    return age <= input.maximumAgeMs ? "RECENT" : "EXPIRED";
  }
}

export class UnsupportedRecentAuthenticationVerifier implements RecentAuthenticationVerifier {
  async verify(): Promise<"PROVIDER_UNAVAILABLE"> {
    return "PROVIDER_UNAVAILABLE";
  }
}

export class FakeRecentAuthenticationVerifier extends ServerSessionRecentAuthenticationVerifier {}

export async function requireRecentAuthentication(
  verifier: RecentAuthenticationVerifier,
  input: {
    userId: string;
    evidence?: RecentAuthenticationEvidence;
    maximumAgeMs: number;
  },
) {
  const result = await verifier.verify(input);
  if (result === "RECENT") return;
  if (result === "EXPIRED")
    documentError(
      "RECENT_AUTH_EXPIRED",
      "Recent Google authentication has expired.",
    );
  if (result === "PROVIDER_UNAVAILABLE")
    documentError(
      "RECENT_AUTH_PROVIDER_UNAVAILABLE",
      "Google reauthentication is unavailable.",
    );
  documentError(
    "RECENT_AUTH_EVIDENCE_MISSING",
    "Recent Google authentication evidence is missing.",
  );
}
