/** Read password values exactly as supplied; trimming can change credentials.
 * @param {FormData} formData
 * @param {string} [field]
 */
export function readPasswordField(formData, field = 'password') {
  const value = formData.get(field)
  return typeof value === 'string' ? value : ''
}
