import { reauthenticatePrivateDocumentAccess } from "@/lib/private-documents/server/reauth-action"

export function ReauthenticatePanel({ returnTo }: { returnTo: string }) {
  const action = reauthenticatePrivateDocumentAccess.bind(null, returnTo)
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <h2 className="font-semibold">Fresh authentication required</h2>
      <p className="mt-2 text-sm">
        Reauthenticate with Google to continue this sensitive document action. The verification remains valid for no more than ten minutes.
      </p>
      <form action={action} className="mt-4">
        <button className="rounded-md bg-amber-950 px-4 py-2 text-sm font-medium text-white" type="submit">
          Reauthenticate and return
        </button>
      </form>
    </section>
  )
}
