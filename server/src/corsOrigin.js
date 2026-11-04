// Unpacked Chrome/Edge extension IDs vary between installations. CORS permits
// their transport; protected routes still require a valid authenticated session.
export function isAllowedOrigin(origin, allowedOrigins) {
  return !origin || allowedOrigins.includes(origin) || /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
}
