// Schemes accepted as they are. Everything else, javascript: and data:
// included, is rejected.
const ALLOWED_URL_SCHEMES = ["https:", "http:", "ipfs:"]

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i

// "example.com:8080/a" carries a port, not a scheme. A host name followed by a
// colon, digits, and then a path delimiter or the end of the string is a port.
// The host must look like a host, otherwise "tel:0312345678" would read as one.
const HOST_WITH_PORT_PATTERN = /^(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d+([/?#]|$)/i

const schemeOf = (url: string): string | undefined => {
  if (HOST_WITH_PORT_PATTERN.test(url)) return undefined
  return url.match(SCHEME_PATTERN)?.[0].toLowerCase()
}

/**
 * Sanitize URL to prevent XSS attacks via javascript: or data: URLs
 */
export const sanitizeUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined

  const trimmed = url.trim()
  if (!trimmed) return undefined

  const scheme = schemeOf(trimmed)

  // If no scheme, assume https
  if (!scheme) return `https://${trimmed}`

  return ALLOWED_URL_SCHEMES.includes(scheme) ? trimmed : undefined
}

// Raster image media types accepted in a data: URL. image/svg+xml is excluded:
// an SVG document can carry script, so it is only inert while the consumer
// renders it through <img>. The media type is what the URL declares about
// itself and the payload behind it is not checked, so a consumer that renders
// the image some other way needs its own guard.
const ALLOWED_IMAGE_DATA_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]

/**
 * Sanitize image URL - allows https: URLs and data: URLs holding a raster image
 */
export const sanitizeImageUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined

  const trimmed = url.trim()
  const lowered = trimmed.toLowerCase()

  if (lowered.startsWith("data:")) {
    const mediaType = lowered.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)[;,]/)?.[1]
    if (mediaType && ALLOWED_IMAGE_DATA_MEDIA_TYPES.includes(mediaType)) {
      return trimmed
    }
    return undefined
  }

  // http: can be swapped for another image in transit and ipfs: is not a scheme
  // the platform can fetch on its own, so images are limited to https:.
  const sanitized = sanitizeUrl(trimmed)
  if (!sanitized || !sanitized.toLowerCase().startsWith("https://")) {
    return undefined
  }

  return sanitized
}
