/** Read password values exactly as supplied; trimming can change credentials.
 * @param {FormData} formData
 * @param {string} [field]
 */
export function readPasswordField(formData, field = 'password') {
  const value = formData.get(field)
  return typeof value === 'string' ? value : ''
}

export function getSafePostLoginRedirect(value) {
  if (typeof value !== 'string') return '/dashboard'
  const isInternalPath =
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    !/^\/[a-z][a-z0-9+.-]*:/i.test(value)
  const isProtectedPath =
    value === '/dashboard' || value.startsWith('/dashboard/') ||
    value === '/auxiliar' || value.startsWith('/auxiliar/')
  return isInternalPath && isProtectedPath ? value : '/dashboard'
}
