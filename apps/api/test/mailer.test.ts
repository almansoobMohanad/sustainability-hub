import { describe, expect, test } from 'vitest'
import { keepAliveWhileSending, type Email, type Mailer } from '../src/email/mailer'

/*
  On Vercel every email being sent is handed to waitUntil, so the function
  isn't stopped before it's out (keepAliveWhileSending). No mail server needed.
*/

const EMAIL: Email = { to: 'someone@example.com', subject: 'Hello', text: 'Hi', html: '<p>Hi</p>' }

describe('keepAliveWhileSending', () => {
  test('hands every send to keepAlive and still returns it to the caller', async () => {
    const sent: Email[] = []
    const kept: Promise<unknown>[] = []
    const mailer = keepAliveWhileSending({ send: async (email) => void sent.push(email) }, (task) => kept.push(task))

    await mailer.send(EMAIL)
    expect(sent).toEqual([EMAIL])
    expect(kept).toHaveLength(1)
    await expect(kept[0]).resolves.toBeUndefined()
  })

  test('a failed send still fails for the caller, but the kept copy never rejects', async () => {
    const failing: Mailer = { send: async () => Promise.reject(new Error('SMTP down')) }
    const kept: Promise<unknown>[] = []
    const mailer = keepAliveWhileSending(failing, (task) => kept.push(task))

    await expect(mailer.send(EMAIL)).rejects.toThrow('SMTP down')
    // waitUntil must never get a rejected promise (it would be an unhandled error)
    await expect(kept[0]).resolves.toBeUndefined()
  })
})
