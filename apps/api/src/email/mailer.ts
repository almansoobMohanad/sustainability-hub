import nodemailer from 'nodemailer'

/*
  Sending email, behind a tiny interface so the rest of the API doesn't care
  HOW mail is sent. Today: SMTP (Mailpit in development; Amazon SES also
  speaks SMTP, so production can use this too). A dedicated SES/API sender or a
  "show the link on screen" sender for offline desktop installs can be added
  later as another Mailer.
*/

export type Email = {
  to: string
  subject: string
  text: string
  html: string
}

export type Mailer = {
  send(email: Email): Promise<void>
}

export function createSmtpMailer({ url, from }: { url: string; from: string }): Mailer {
  const transport = nodemailer.createTransport(url)
  return {
    async send(email) {
      await transport.sendMail({ from, ...email })
    },
  }
}

/**
 * For hosts that may stop the process as soon as a request has been answered
 * (Vercel functions): every email being sent is handed to `keepAlive` (Vercel's
 * waitUntil), which keeps the function running until it's sent. A long-running
 * server doesn't need this.
 */
export function keepAliveWhileSending(mailer: Mailer, keepAlive: (task: Promise<unknown>) => void): Mailer {
  return {
    send(email) {
      const sending = mailer.send(email)
      // The caller handles failures (sendInBackground logs them); this copy only waits
      keepAlive(sending.catch(() => {}))
      return sending
    },
  }
}

/**
 * Send without making the caller wait. Auth endpoints must answer just as fast
 * whether or not an email was sent, otherwise response times would reveal
 * which email addresses have accounts. Failures are logged, never shown to users.
 */
export function sendInBackground(mailer: Mailer, email: Email) {
  mailer.send(email).catch((error: unknown) => {
    console.error(`Failed to send email "${email.subject}":`, error)
  })
}
