import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink
} from 'firebase/auth'
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

if (import.meta.env.DEV) {
  console.log('[Flypost App] Firebase config loaded:', {
    apiKeyPresent: Boolean(firebaseConfig.apiKey),
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket
  })
}

if (!firebaseConfig.apiKey) {
  console.error('[Flypost App] Missing Firebase API key. Check Vite environment variables.')
}

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const storage = getStorage(app)

export async function startEmailLinkSignIn(email) {
  const actionCodeSettings = {
    url: `${window.location.origin}/finishSignIn`,
    handleCodeInApp: true
  }

  await sendSignInLinkToEmail(auth, email, actionCodeSettings)
  window.localStorage.setItem('flypostEmailForSignIn', email)
}

export async function completeEmailLinkSignIn() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null

  let email = window.localStorage.getItem('flypostEmailForSignIn') || ''
  if (!email) {
    email = window.prompt('Please confirm your email for Flypost sign-in') || ''
  }

  const result = await signInWithEmailLink(auth, email, window.location.href)
  window.localStorage.removeItem('flypostEmailForSignIn')
  return result.user
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback)
}

export function uploadFlyerImage({ uid, file, onProgress }) {
  const ext = file.name?.split('.').pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `flyers/${uid}/${crypto.randomUUID()}.${ext}`
  const storageRef = ref(storage, path)
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'image/jpeg'
  })

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        if (onProgress) onProgress(pct)
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        resolve({ url, path })
      }
    )
  })
}
