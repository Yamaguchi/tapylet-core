/**
 * Sanitize URL to prevent XSS attacks via javascript: or data: URLs
 */
export const sanitizeUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined

  const trimmed = url.trim().toLowerCase()

  // Block dangerous URL schemes
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:")
  ) {
    return undefined
  }

  // Only allow http, https, and ipfs URLs
  if (
    !trimmed.startsWith("http://") &&
    !trimmed.startsWith("https://") &&
    !trimmed.startsWith("ipfs://")
  ) {
    // If no scheme, assume https
    if (!trimmed.includes("://")) {
      return `https://${url.trim()}`
    }
    return undefined
  }

  return url.trim()
}

// Raster image media types accepted in a data: URL. image/svg+xml is excluded:
// an SVG document can carry script, so it is only inert while the consumer
// renders it through <img>. Keeping it out means the guard does not depend on
// how the consumer renders the image.
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
