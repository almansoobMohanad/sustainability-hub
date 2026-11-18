/**
 * Better Auth needs a unique, URL-safe "slug" for every company. Nobody sees
 * it in this app, so it's generated: the name in lowercase letters and dashes,
 * plus a random suffix so two companies with the same name never clash.
 * "Green Steel Sdn. Bhd." -> "green-steel-sdn-bhd-k3x9qa"
 */
export function companySlug(name: string) {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop accents: é -> e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const random = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => alphabet[byte % alphabet.length]).join('')
  return `${base || 'company'}-${random}`
}
