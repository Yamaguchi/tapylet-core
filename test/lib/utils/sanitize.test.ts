import { sanitizeImageUrl, sanitizeUrl } from '~/core/utils/sanitize'

// Token metadata is written by the issuer of the token, and anyone can send a
// token to any address, so both helpers treat their input as hostile.

describe('sanitizeUrl', () => {
  it('accepts http, https and ipfs URLs as they are', () => {
    expect(sanitizeUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(sanitizeUrl('http://example.com/a')).toBe('http://example.com/a')
    expect(sanitizeUrl('ipfs://cid/a')).toBe('ipfs://cid/a')
  })

  it('assumes https when the URL carries no scheme', () => {
    expect(sanitizeUrl('example.com/a')).toBe('https://example.com/a')
  })

  it('rejects script-bearing and data schemes', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBeUndefined()
    expect(sanitizeUrl('data:text/html,<script></script>')).toBeUndefined()
    expect(sanitizeUrl('ftp://example.com/a')).toBeUndefined()
  })

  it('rejects empty input', () => {
    expect(sanitizeUrl(undefined)).toBeUndefined()
    expect(sanitizeUrl('')).toBeUndefined()
  })
})

describe('sanitizeImageUrl', () => {
  it('accepts https URLs and trims surrounding space', () => {
    expect(sanitizeImageUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(sanitizeImageUrl('  https://example.com/a.png  ')).toBe('https://example.com/a.png')
  })

  it('assumes https when the URL carries no scheme', () => {
    expect(sanitizeImageUrl('example.com/a.png')).toBe('https://example.com/a.png')
  })

  it('rejects http and ipfs URLs', () => {
    expect(sanitizeImageUrl('http://example.com/a.png')).toBeUndefined()
    expect(sanitizeImageUrl('HTTP://example.com/a.png')).toBeUndefined()
    expect(sanitizeImageUrl('ipfs://cid/a.png')).toBeUndefined()
  })

  it('accepts data URLs holding a raster image', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(sanitizeImageUrl(png)).toBe(png)
    expect(sanitizeImageUrl('data:image/gif,GIF89a')).toBe('data:image/gif,GIF89a')
    expect(sanitizeImageUrl('data:IMAGE/WEBP;base64,UklGRg==')).toBe(
      'data:IMAGE/WEBP;base64,UklGRg=='
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
  })
})
