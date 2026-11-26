/* Dates and times in the report's history and its "last edited" line */

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const time = (date: Date) => date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const day = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })

/** "Today, 14:05 to 14:20", "3 Nov, 09:12" */
export function whenText(startedAt: string, endedAt: string) {
  const start = new Date(startedAt)
  const end = new Date(endedAt)
  const date = sameDay(end, new Date()) ? 'Today' : day(end)
  return time(start) === time(end) || !sameDay(start, end) ? `${date}, ${time(end)}` : `${date}, ${time(start)} to ${time(end)}`
}

/** "just now", "5 minutes ago", "today at 14:05", "3 Nov at 09:12" */
export function editedWhen(iso: string, now = new Date()) {
  const date = new Date(iso)
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  return `${sameDay(date, now) ? 'today' : day(date)} at ${time(date)}`
}
