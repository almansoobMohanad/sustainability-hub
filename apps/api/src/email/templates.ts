import type { Email } from './mailer'

/*
  The emails the API sends. Every email has a plain-text version (some mail
  apps and screen readers prefer it) and an HTML version. Anything that came
  from a user (their name) is escaped before going into HTML.

  Email HTML is NOT web HTML. Mail apps support far less CSS than browsers;
  Outlook on Windows renders with Microsoft Word's engine. So the HTML here
  follows email conventions (checked with Mailpit's HTML check):
  - layout with tables (role="presentation" so screen readers skip them), no div/flex
  - spacing with padding on table cells (Outlook ignores margin and most padding elsewhere)
  - colours as bgcolor attributes plus background-color (never the background shorthand)
  - nothing styled on <body> (many clients replace it); an outer table holds the background
  - the card is max 520px wide; Outlook ignores max-width, so it gets a fixed-width
    table inside an "if mso" conditional comment that only Outlook reads
  - "bulletproof" button: the green is on a table cell, so it shows everywhere
  - border-radius / font-weight / text-decoration are fine to keep: where unsupported
    you just get square corners or a plain style, nothing breaks
*/

const PRODUCT = 'Sustainability Hub'

const COLOR = {
  page: '#f5f5f5',
  card: '#ffffff',
  text: '#171717',
  muted: '#525252',
  brand: '#059669', // emerald-600
  link: '#047857', // emerald-700: readable contrast on white for small text
}
const FONT = 'Arial,Helvetica,sans-serif'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** First name for the greeting, e.g. "Aisyah" from "Aisyah Rahman". */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'there'
}

/**
 * A long URL has no spaces, so narrow screens can't wrap it. Add invisible
 * break opportunities (<wbr>) after / ? & = (copying the link still gives the
 * exact URL). Used instead of word-break, which many mail apps ignore.
 */
function breakableUrl(url: string) {
  return escapeHtml(url).replace(/([/?=]|&amp;)/g, '$1<wbr>')
}

/** One row of the card: a table cell with text styles (mail apps don't inherit styles reliably). */
function row(html: string, { size = 15, color = COLOR.text, bottom = 16, bold = false } = {}) {
  const lineHeight = Math.round(size * 1.6)
  return `<tr><td style="padding:0 0 ${bottom}px 0;font-family:${FONT};font-size:${size}px;line-height:${lineHeight}px;mso-line-height-rule:exactly;color:${color};${bold ? 'font-weight:bold;' : ''}">${html}</td></tr>`
}

function button({ label, url }: { label: string; url: string }) {
  return `<tr><td style="padding:8px 0 24px 0">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
    <tr><td bgcolor="${COLOR.brand}" style="background-color:${COLOR.brand};border-radius:999px;padding:12px 24px">
      <a href="${escapeHtml(url)}" style="font-family:${FONT};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a>
    </td></tr>
  </table>
</td></tr>`
}

const link = (url: string) => `<a href="${escapeHtml(url)}" style="color:${COLOR.link}">${breakableUrl(url)}</a>`

type Content = {
  to: string
  subject: string
  greetingName: string
  paragraphs: string[]
  action?: { label: string; url: string }
  /** A second, smaller link under the button, e.g. "Forgot your password?" */
  extraLink?: { text: string; url: string }
  footnote: string
}

function compose({ to, subject, greetingName, paragraphs, action, extraLink, footnote }: Content): Email {
  const text = [
    `Hi ${greetingName},`,
    ...paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    ...(extraLink ? [`${extraLink.text}: ${extraLink.url}`] : []),
    footnote,
    `- ${PRODUCT}`,
  ].join('\n\n')

  const rows = [
    row(PRODUCT, { color: COLOR.brand, bold: true, bottom: 24 }),
    row(`Hi ${escapeHtml(greetingName)},`),
    ...paragraphs.map((paragraph) => row(escapeHtml(paragraph))),
    ...(action
      ? [
          button(action),
          row(`If the button doesn't work, copy this link into your browser:<br>${link(action.url)}`, {
            size: 13,
            color: COLOR.muted,
          }),
        ]
      : []),
    ...(extraLink ? [row(`${escapeHtml(extraLink.text)}: ${link(extraLink.url)}`, { size: 13, color: COLOR.muted })] : []),
    row(escapeHtml(footnote), { size: 13, color: COLOR.muted, bottom: 0 }),
  ]

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${COLOR.page}" style="background-color:${COLOR.page}">
  <tr><td align="center" style="padding:24px 12px">
    <!--[if mso]><table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${COLOR.card}" style="background-color:${COLOR.card};max-width:520px;border-radius:12px">
      <tr><td style="padding:32px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${rows.join('\n          ')}
        </table>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`

  return { to, subject, text, html }
}

type User = { name: string; email: string }

export function verifyEmailMessage(user: User, url: string): Email {
  return compose({
    to: user.email,
    subject: `Verify your email for ${PRODUCT}`,
    greetingName: firstName(user.name),
    paragraphs: ['Confirm your email address to finish setting up your account. This link expires in 24 hours.'],
    action: { label: 'Verify email', url },
    footnote: "If you didn't create an account, you can ignore this email.",
  })
}

export function resetPasswordMessage(user: User, url: string): Email {
  return compose({
    to: user.email,
    subject: `Reset your ${PRODUCT} password`,
    greetingName: firstName(user.name),
    paragraphs: [
      'Someone asked to reset the password for your account. Choose a new password using the link below. It expires in 1 hour and works once.',
    ],
    action: { label: 'Choose a new password', url },
    footnote: "If you didn't ask for this, ignore this email: your password stays the same.",
  })
}

export function passwordChangedMessage(user: User, signInUrl: string): Email {
  return compose({
    to: user.email,
    subject: `Your ${PRODUCT} password was changed`,
    greetingName: firstName(user.name),
    paragraphs: [
      'The password for your account was just changed, and you were signed out on all devices.',
      "If this wasn't you, reset your password straight away from the sign-in page.",
    ],
    action: { label: 'Go to sign in', url: signInUrl },
    footnote: 'You received this email to keep your account secure.',
  })
}

/** An Admin invited this email address to join their company. */
export function invitationMessage({
  to,
  inviterName,
  companyName,
  roleLabel,
  url,
}: {
  to: string
  inviterName: string
  companyName: string
  roleLabel: string
  url: string
}): Email {
  return compose({
    to,
    subject: `${inviterName} invited you to ${companyName} on ${PRODUCT}`,
    greetingName: 'there',
    paragraphs: [
      `${inviterName} invited you to join ${companyName} on ${PRODUCT} as a ${roleLabel}.`,
      `To accept, sign in or create an account with this email address (${to}). The invitation expires in 7 days.`,
    ],
    action: { label: 'View invitation', url },
    footnote: "If you weren't expecting this, you can ignore this email.",
  })
}

/**
 * Sent when someone tries to sign up with an email that already has an account.
 * The sign-up screen looks exactly the same either way (so it doesn't reveal
 * which emails are registered); the real owner learns about it here instead.
 */
export function existingAccountMessage(user: User, signInUrl: string, resetUrl: string): Email {
  return compose({
    to: user.email,
    subject: `You already have a ${PRODUCT} account`,
    greetingName: firstName(user.name),
    paragraphs: ['Someone just tried to create a new account with this email address, but you already have one.'],
    action: { label: 'Sign in', url: signInUrl },
    extraLink: { text: 'Forgot your password? Reset it here', url: resetUrl },
    footnote: "If this wasn't you, you can ignore this email. Your account hasn't changed.",
  })
}
