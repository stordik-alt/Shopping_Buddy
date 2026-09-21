import Link from 'next/link'
import { Brand } from '@/components/shared/brand'
import { auth } from '@/lib/auth/server'
import { getInvitationByToken } from '@/lib/db/queries'
import { AcceptInviteButton } from './accept-invite-button'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [invitation, session] = await Promise.all([getInvitationByToken(token), auth.getSession()])
  const user = session.data?.user
  const expired = invitation ? new Date(invitation.expiresAt) < new Date() : false

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 text-center">
          {!invitation ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Pozvánka nenalezena</h1>
              <p className="mt-2 text-sm text-muted-foreground">Odkaz je neplatný nebo byl smazán.</p>
            </>
          ) : invitation.status !== 'pending' ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Pozvánka už není platná</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {invitation.status === 'accepted' ? 'Tato pozvánka už byla přijata.' : 'Tato pozvánka byla zrušena.'}
              </p>
            </>
          ) : expired ? (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Platnost pozvánky vypršela</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Požádejte {invitation.invitedByName ?? 'správce domácnosti'} o novou pozvánku.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Pozvánka do domácnosti</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {invitation.invitedByName ?? 'Někdo'} vás zve do domácnosti{' '}
                <span className="font-medium text-foreground">{invitation.householdName}</span> na Shopping Buddy.
              </p>
              {!user ? (
                <div className="mt-6 flex flex-col gap-2">
                  <Link
                    href={`/auth/sign-up?invite=${token}&email=${encodeURIComponent(invitation.email)}`}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
                  >
                    Vytvořit účet a přijmout
                  </Link>
                  <Link
                    href={`/auth/sign-in?invite=${token}&email=${encodeURIComponent(invitation.email)}`}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                  >
                    Už mám účet, přihlásit se
                  </Link>
                </div>
              ) : user.email.toLowerCase() !== invitation.email.toLowerCase() ? (
                <p className="mt-6 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                  Jste přihlášeni jako {user.email}, ale pozvánka je pro {invitation.email}. Odhlaste se a zkuste to znovu se
                  správným účtem.
                </p>
              ) : (
                <div className="mt-6">
                  <AcceptInviteButton token={token} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
