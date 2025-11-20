//v1
// src/components/AuthButton.tsx
import React, { useEffect, useState } from 'react'
import { auth, startEmailLinkSignIn, subscribeToAuth } from '../firebase'
import { signOut, type User } from 'firebase/auth'

export function AuthButton() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeToAuth(setUser)
    return () => unsub()
  }, [])

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSending(true)
    try {
      await startEmailLinkSignIn(email.trim())
      setSent(true)
    } catch (err: any) {
      console.error('Error sending sign-in link', err)
      setError(err?.message || 'Failed to send sign-in link')
    } finally {
      setIsSending(false)
    }
  }

  async function handleSignOut() {
    await signOut(auth)
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">
          Signed in as <strong>{user.email}</strong>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-100"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSendLink} className="flex items-center gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="px-2 py-1 text-sm border rounded"
      />
      <button
        type="submit"
        disabled={isSending}
        className="px-3 py-1 text-sm font-medium rounded bg-black text-white disabled:opacity-60"
      >
        {isSending ? 'Sending…' : 'Sign up to Flypost'}
      </button>
      {sent && (
        <span className="text-xs text-green-700">
          Check your email for a sign-in link.
        </span>
      )}
      {error && (
        <span className="text-xs text-red-600">
          {error}
        </span>
      )}
    </form>
  )
}
