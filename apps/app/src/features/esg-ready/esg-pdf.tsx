import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { printable } from '../reports/pdf-text'

/*
  The ESG Ready self-assessment as a PDF (A4 portrait, built in the browser by
  @react-pdf/renderer, loaded only when someone downloads). Page 1: the score,
  its band and the score per section; then every question with the answer
  given and the points it earned. Plain and neutral, with the app's emerald as
  the only accent; meaning is always in words, never only in colour.
*/

export type PdfAnswer = { label?: string; text: string }
export type PdfQuestion = { number: number; title: string; answers: PdfAnswer[]; points?: string }
export type PdfSection = { id: string; title: string; summary?: string; questions: PdfQuestion[] }
export type PdfInput = {
  companyName: string
  year: number
  generatedOn: string
  score: { percent: number; points: number; max: number; band: string; description: string }
  sectionScores: { id: string; title: string; points: number; max: number }[]
  answered: number
  asked: number
  sections: PdfSection[]
}

Font.registerHyphenationCallback((word) => [word])


const INK = '#1A1A1A'
const MUTED = '#5F5F5F'
const FAINT = '#9A9A9A'
const LINE = '#D9D9D9'
const ACCENT = '#047857' // emerald-700

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 9.5, color: INK },
  brand: { fontSize: 8.5, color: ACCENT, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginTop: 6 },
  subtitle: { fontSize: 10.5, color: MUTED, marginTop: 4 },
  rule: { borderBottomWidth: 2, borderColor: ACCENT, marginTop: 14, marginBottom: 18, width: 48 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  scoreNumber: { fontSize: 34, fontFamily: 'Helvetica-Bold' },
  scoreOf: { fontSize: 10, color: MUTED, marginBottom: 6 },
  band: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 6 },
  bandText: { fontSize: 10, color: MUTED, marginTop: 2 },
  small: { fontSize: 8.5, color: MUTED },
  tableTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderColor: LINE, paddingVertical: 6 },
  headRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: INK, paddingBottom: 5 },
  bold: { fontFamily: 'Helvetica-Bold' },
  bar: { height: 4, backgroundColor: '#EEEEEE', borderRadius: 2, marginTop: 4 },
  barFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2 },
  sectionTitle: { fontSize: 12.5, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sectionSummary: { fontSize: 9, color: MUTED, marginBottom: 10 },
  question: { paddingVertical: 8, borderBottomWidth: 0.75, borderColor: LINE },
  questionHead: { flexDirection: 'row', gap: 8 },
  number: { width: 24, fontFamily: 'Helvetica-Bold', color: MUTED },
  answer: { marginTop: 3, marginLeft: 32 },
  notAnswered: { marginTop: 4, marginLeft: 32, color: FAINT },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
  },
})

const percent = (points: number, max: number) => (max ? Math.round((points / max) * 100) : 0)

function Footer({ input }: { input: PdfInput }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {input.companyName} · ESG Ready self-assessment {input.year} · Prepared with Sustainability Hub on {input.generatedOn}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}

export function EsgReadyDocument(input: PdfInput) {
  return (
    <Document
      title={`ESG Ready self-assessment ${input.year} - ${input.companyName}`}
      author={input.companyName}
      creator="Sustainability Hub"
      producer="Sustainability Hub"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>ESG READINESS SELF-ASSESSMENT</Text>
        <Text style={styles.title}>{input.companyName}</Text>
        <Text style={styles.subtitle}>
          {input.year} · Based on MITI&apos;s i-ESGReady questionnaire (National Industry ESG framework)
        </Text>
        <View style={styles.rule} />

        <Text style={styles.small}>Readiness score</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreNumber}>{input.score.percent}%</Text>
          <Text style={styles.scoreOf}>
            {input.score.points} of {input.score.max} points
          </Text>
        </View>
        <Text style={styles.band}>{input.score.band}</Text>
        <Text style={styles.bandText}>{input.score.description}</Text>
        <Text style={[styles.small, { marginTop: 8 }]}>
          {input.answered} of {input.asked} questions answered. Each answer earns 0 to 3 points by how far along it is (1
          point per stakeholder engaged, up to 6); unanswered questions earn none.
        </Text>

        <Text style={styles.tableTitle}>Score per section</Text>
        <View style={styles.headRow}>
          <Text style={[styles.bold, { flex: 1 }]}>Section</Text>
          <Text style={[styles.bold, { width: 70, textAlign: 'right' }]}>Points</Text>
          <Text style={[styles.bold, { width: 60, textAlign: 'right' }]}>Score</Text>
        </View>
        {input.sectionScores.map((section) => (
          <View key={section.id} style={styles.row} wrap={false}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text>
                {section.id}. {section.title}
              </Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${percent(section.points, section.max)}%` }]} />
              </View>
            </View>
            <Text style={{ width: 70, textAlign: 'right' }}>
              {section.points} / {section.max}
            </Text>
            <Text style={{ width: 60, textAlign: 'right' }}>{percent(section.points, section.max)}%</Text>
          </View>
        ))}
        <Footer input={input} />
      </Page>

      <Page size="A4" style={styles.page}>
        {input.sections.map((section, index) => (
          <View key={section.id} break={index > 0} style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>
              {section.id}. {section.title}
            </Text>
            {section.summary ? <Text style={styles.sectionSummary}>{section.summary}</Text> : <View style={{ marginBottom: 8 }} />}
            {section.questions.map((question) => (
              <View key={question.number} style={styles.question} wrap={false}>
                <View style={styles.questionHead}>
                  <Text style={styles.number}>Q{question.number}</Text>
                  <Text style={[styles.bold, { flex: 1 }]}>{printable(question.title)}</Text>
                  {question.points ? <Text style={[styles.small, { width: 70, textAlign: 'right' }]}>{question.points}</Text> : null}
                </View>
                {question.answers.length === 0 ? (
                  <Text style={styles.notAnswered}>Not answered</Text>
                ) : (
                  question.answers.map((answer, answerIndex) => (
                    <Text key={answerIndex} style={styles.answer}>
                      {answer.label ? <Text style={{ color: MUTED }}>{answer.label}: </Text> : null}
                      {printable(answer.text)}
                    </Text>
                  ))
                )}
              </View>
            ))}
          </View>
        ))}
        <Footer input={input} />
      </Page>
    </Document>
  )
}
