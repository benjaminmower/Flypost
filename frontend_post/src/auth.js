/**
 * Flypost Post - Auth API
 * Thin wrappers over firebase.js for named, consistent exports.
 */

import { startEmailLinkSignIn, completeEmailLinkSignIn, auth } from './firebase.js'

export const sendMagicLink = (email) => startEmailLinkSignIn(email)

export const handleMagicLinkReturn = () => completeEmailLinkSignIn()

export const getCurrentUser = () => auth.currentUser

export const signOut = () => auth.signOut()
