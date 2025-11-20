//v1
// src/pages/FinishSignIn.tsx
import React, { useEffect, useState } from 'react'
import { completeEmailLinkSignIn } from '../firebase'
import { useNavigate } from 'react-router-dom' // or your router of choice

export function FinishSignIn() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending')

  useEffect(() => {
    async function run() {
      try {
        const user = await completeEmailLinkSignIn()
        if (user) {
          setStatus('success')
          // After a brief pause, redirect to home or dashboard
          setTimeout(() => navigate('/', { replace: true }), 1000)
        } else {
          setStatus('error')
        }
      } catch (err) {
        console.error('Error completing email link sign-in', err)
        setStatus('error')
      }
    }
    run()
  }, [navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      {status === 'pending' && <p>Completing sign-in…</p>}
      {status === 'success' && <p>Signed in! Redirecting…</p>}
      {status === 'error' && (
        <p>
          There was a problem completing your sign-in link. Try opening the link again
          or request a new one.
        </p>
      )}
    </div>
  )
}
