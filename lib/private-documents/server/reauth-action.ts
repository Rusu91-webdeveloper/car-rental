"use server";

import { signIn } from "@/lib/auth";

function safeReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  return value;
}

export async function reauthenticatePrivateDocumentAccess(returnTo: string) {
  return signIn(
    "google",
    { redirectTo: safeReturnPath(returnTo) },
    { prompt: "login", max_age: "0" },
  );
}
