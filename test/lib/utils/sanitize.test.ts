import { sanitizeImageUrl, sanitizeUrl } from '~/core/utils/sanitize'

// Token metadata is written by the issuer of the token, and anyone can send a
// token to any address, so both helpers treat their input as hostile.

describe('sanitizeUrl', () => {
  it('accepts http, https and ipfs URLs as they are', () => {
    expect(sanitizeUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(sanitizeUrl('http://example.com/a')).toBe('http://example.com/a')
    expect(sanitizeUrl('ipfs://cid/a')).toBe('ipfs://cid/a')
  })

  it('keeps the case of the scheme as it was given', () => {
    expect(sanitizeUrl('HTTPS://example.com/a')).toBe('HTTPS://example.com/a')
  })

  it('assumes https when the URL carries no scheme', () => {
    expect(sanitizeUrl('example.com/a')).toBe('https://example.com/a')
  })

  it('reads a colon followed by a port as part of the host, not as a scheme', () => {
    expect(sanitizeUrl('example.com:8080/a')).toBe('https://example.com:8080/a')
    expect(sanitizeUrl('example.com:8080')).toBe('https://example.com:8080')
    expect(sanitizeUrl('localhost:3000/a')).toBe('https://localhost:3000/a')
  })

  it('reads a single-label host with a port as a host', () => {
    // A private Tapyrus network reaches its services by machine name
    expect(sanitizeUrl('intranet:8443/logo.png')).toBe('https://intranet:8443/logo.png')
    expect(sanitizeUrl('myhost:8080')).toBe('https://myhost:8080')
    expect(sanitizeUrl('INTRANET:8443')).toBe('https://INTRANET:8443')
  })

  it('rejects script-bearing and data schemes', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBeUndefined()
    expect(sanitizeUrl('data:text/html,<script></script>')).toBeUndefined()
    expect(sanitizeUrl('ftp://example.com/a')).toBeUndefined()
  })

  it('rejects any other scheme instead of prefixing https', () => {
    // Each of these parses once https:// is prefixed, so the host has to be
    // checked rather than the parse alone: mailto: lands example.com in the
    // host, file: leaves no port
    expect(sanitizeUrl('mailto:foo@example.com')).toBeUndefined()
    expect(sanitizeUrl('tel:0312345678')).toBeUndefined()
    expect(sanitizeUrl('file:///etc/passwd')).toBeUndefined()
  })

  it('rejects empty input', () => {
    expect(sanitizeUrl(undefined)).toBeUndefined()
    expect(sanitizeUrl('')).toBeUndefined()
    expect(sanitizeUrl('   ')).toBeUndefined()
  })
})

describe('sanitizeImageUrl', () => {
  it('accepts https URLs and trims surrounding space', () => {
    expect(sanitizeImageUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(sanitizeImageUrl('  https://example.com/a.png  ')).toBe('https://example.com/a.png')
  })

  it('accepts an https URL whose scheme is in upper case', () => {
    expect(sanitizeImageUrl('HTTPS://example.com/a.png')).toBe('HTTPS://example.com/a.png')
  })

  it('assumes https when the URL carries no scheme', () => {
    expect(sanitizeImageUrl('example.com/a.png')).toBe('https://example.com/a.png')
  })

  it('rejects http and ipfs URLs', () => {
    expect(sanitizeImageUrl('http://example.com/a.png')).toBeUndefined()
    expect(sanitizeImageUrl('HTTP://example.com/a.png')).toBeUndefined()
    expect(sanitizeImageUrl('ipfs://cid/a.png')).toBeUndefined()
  })

  it('rejects any other scheme instead of prefixing https', () => {
    expect(sanitizeImageUrl('mailto:foo@example.com')).toBeUndefined()
    expect(sanitizeImageUrl('file:///etc/passwd')).toBeUndefined()
  })

  it('reads a single-label host with a port as a host', () => {
    expect(sanitizeImageUrl('intranet:8443/logo.png')).toBe('https://intranet:8443/logo.png')
  })

  it('accepts data URLs holding a raster image', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(sanitizeImageUrl(png)).toBe(png)
    expect(sanitizeImageUrl('data:image/gif,GIF89a')).toBe('data:image/gif,GIF89a')
    expect(sanitizeImageUrl('data:IMAGE/WEBP;base64,UklGRg==')).toBe(
      'data:IMAGE/WEBP;base64,UklGRg=='
    )
  })

  it('accepts a data URL carrying a parameter after the media type', () => {
    expect(sanitizeImageUrl('data:image/png;charset=utf-8;base64,AAAA')).toBe(
      'data:image/png;charset=utf-8;base64,AAAA'
    )
  })

  it('trims the space around a data URL', () => {
    expect(sanitizeImageUrl('  data:image/png;base64,AAAA  ')).toBe(
      'data:image/png;base64,AAAA'
    )
  })

  it('rejects data URLs holding an SVG', () => {
    expect(
      sanitizeImageUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')
    ).toBeUndefined()
    expect(
      sanitizeImageUrl('data:image/svg+xml,<svg onload="alert(1)"></svg>')
    ).toBeUndefined()
  })

  it('rejects data URLs of any other media type', () => {
    expect(sanitizeImageUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined()
    expect(sanitizeImageUrl('data:image/png')).toBeUndefined()
    expect(sanitizeImageUrl('data:,image/png;base64,AAAA')).toBeUndefined()
  })

  it('rejects script-bearing schemes', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeImageUrl('vbscript:msgbox(1)')).toBeUndefined()
  })

  it('rejects empty input', () => {
    expect(sanitizeImageUrl(undefined)).toBeUndefined()
    expect(sanitizeImageUrl('')).toBeUndefined()
    expect(sanitizeImageUrl('   ')).toBeUndefined()
  })
})
