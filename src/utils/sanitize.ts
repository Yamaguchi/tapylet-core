// Schemes accepted as they are. Everything else, javascript: and data:
// included, is rejected.
const ALLOWED_URL_SCHEMES = ["https:", "http:", "ipfs:"]

// Schemes that address a host and therefore need "//" after the colon.
// "https:example.com" names no host: a browser resolves it against the page it
// is rendered on, so the link points back at the wallet itself.
const SCHEMES_REQUIRING_AUTHORITY = ["https:", "http:"]

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i

// "example.com:8080/a" and "intranet:8443/logo.png" carry a port, not a
// scheme. Prefixing https:// tells the two apart: the text before the colon
// has to come back as the host and what follows as the port. That rules out
// "javascript:alert(1)", which has no port at all, and "mailto:foo@example.com",
// which parses but puts example.com in the host and "mailto:foo" in the
// userinfo.
//
// Whatever this accepts is returned with https:// prefixed, so reading a
// scheme as a host cannot produce a dangerous URL — only a link to a host
// that does not exist.
const isHostWithPort = (url: string): boolean => {
  let parsed: URL
  try {
    parsed = new URL(`https://${url}`)
  } catch {
    return false
  }
  const beforeColon = url.slice(0, url.indexOf(":")).toLowerCase()
  return parsed.port !== "" && parsed.hostname === beforeColon
}

const schemeOf = (url: string): string | undefined => {
  const scheme = url.match(SCHEME_PATTERN)?.[0].toLowerCase()
  if (!scheme || isHostWithPort(url)) return undefined
  return scheme
}

/**
 * Sanitize a URL read from token metadata.
 *
 * Accepts `https:`, `http:` and `ipfs:`. Input carrying no scheme gets
 * `https://` prefixed, and a host followed by a port (`intranet:8443/logo.png`)
 * counts as carrying no scheme. `https:` and `http:` must name a host:
 * `https:example.com` has no authority and a browser resolves it against the
 * page it is rendered on. Everything else, `javascript:` and `data:` included,
 * returns `undefined`.
 */
export const sanitizeUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined

  const trimmed = url.trim()
  if (!trimmed) return undefined

  const scheme = schemeOf(trimmed)

  // If no scheme, assume https
  if (!scheme) return `https://${trimmed}`

  if (!ALLOWED_URL_SCHEMES.includes(scheme)) return undefined

  if (
    SCHEMES_REQUIRING_AUTHORITY.includes(scheme) &&
    !trimmed.slice(scheme.length).startsWith("//")
  ) {
    return undefined
  }

  return trimmed
}

// Raster image media types accepted in a data: URL. image/svg+xml is excluded
// because an SVG document can carry script.
const ALLOWED_IMAGE_DATA_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]

const DATA_MEDIA_TYPE_PATTERN = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)[;,]/i

/**
 * Sanitize an image URL read from token metadata.
 *
 * Accepts `https:` URLs and `data:` URLs declaring a raster image media type
 * (`png`, `jpeg`, `jpg`, `gif`, `webp`), and prefixes `https://` when the input
 * carries no scheme. `http:`, `ipfs:` and `data:image/svg+xml` return
 * `undefined`.
 *
 * **The check stops at the URL, so the result is only safe to render through
 * `<img>`**, which keeps an SVG inert whatever the bytes turn out to be. For a
 * `data:` URL the media type is what the URL declares about itself and the
 * payload is never decoded. For an `https:` URL nothing about the response is
 * known at all, so `https://example.com/icon.svg` passes.
 *
 * A consumer that fetches the image and inlines it, or renders it through
 * `<object>`, `<embed>` or a WebView, needs its own guard.
 */
export const sanitizeImageUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined

  const trimmed = url.trim()
  if (!trimmed) return undefined

  const scheme = schemeOf(trimmed)

  if (scheme === "data:") {
    const mediaType = trimmed.match(DATA_MEDIA_TYPE_PATTERN)?.[1].toLowerCase()
    return mediaType && ALLOWED_IMAGE_DATA_MEDIA_TYPES.includes(mediaType)
      ? trimmed
      : undefined
  }

  // http: can be swapped for another image in transit and ipfs: is not a scheme
  // the platform can fetch on its own, so images are limited to https:.
  if (scheme && scheme !== "https:") return undefined

  // No scheme leaves sanitizeUrl to prefix https://; https: leaves it to check
  // that an authority follows.
  return sanitizeUrl(trimmed)
}
