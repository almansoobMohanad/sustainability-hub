import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { SEDG_LEVEL_LABELS, SEDG_PILLAR_LABELS, type SedgLevel, type SedgPillar } from '@hub/shared/sedg'
import { printable } from '../reports/pdf-text'
import { SEDG_COLORS, SEDG_GENERAL_COLORS } from './style'

/*
  The SEDG report as a PDF, laid out like the official v2 data template: a navy
  title, the general information table, then one table per pillar with the
  template's columns and colours (Code and Level cells in the pillar's colour,
  darkest for Basic). Built in the browser by @react-pdf/renderer (loaded only
  when someone downloads, see download-pdf.ts); nothing is stored anywhere.
  A4 landscape: the template's seven columns need the width.
*/

export type PdfRow = { indicator: string; value: string; unit: string }
export type PdfDisclosure = { code: string; level: SedgLevel; topic: string; title: string; rows: PdfRow[] }
export type PdfInput = {
  companyName: string
  year: number
  level: SedgLevel
  generatedOn: string
  general: { label: string; value: string }[]
  pillars: { pillar: SedgPillar; disclosures: PdfDisclosure[] }[]
}

// Words are never split across lines ("reduc-tion"): a whole word moves to the next line
Font.registerHyphenationCallback((word) => [word])

const COLUMNS = { code: 52, level: 68, topic: 100, title: 118, indicator: 214, value: 152, unit: 74 }
const BORDER = '#BFBFBF'
const MUTED = '#595959'

/** White or near-black text, whichever is readable on the colour (WCAG contrast) */
function textOn(hex: string) {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return (1.05 / (luminance + 0.05) >= 4.5 ? '#FFFFFF' : '#1A1A1A')
}

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 32, fontFamily: 'Helvetica', fontSize: 8.5, color: '#1A1A1A' },
  title: { backgroundColor: SEDG_GENERAL_COLORS.header, color: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 12 },
  titleText: { fontFamily: 'Helvetica-Bold', fontSize: 15, letterSpacing: 0.5 },
  subtitle: { fontSize: 9, marginTop: 3 },
  statement: { marginTop: 10, marginBottom: 14, fontSize: 8.5, color: MUTED, lineHeight: 1.4 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 6 },
  table: { borderTopWidth: 0.75, borderLeftWidth: 0.75, borderColor: BORDER },
  row: { flexDirection: 'row' },
  cell: { borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: BORDER, paddingVertical: 4, paddingHorizontal: 5 },
  headerCell: { fontFamily: 'Helvetica-Bold' },
  bold: { fontFamily: 'Helvetica-Bold' },
  empty: { color: '#9A9A9A' },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: MUTED,
  },
})

const NOT_REPORTED = '-'

function GeneralTable({ rows }: { rows: PdfInput['general'] }) {
  return (
    <View style={[styles.table, { marginBottom: 18 }]}>
      <View style={[styles.row, { backgroundColor: SEDG_GENERAL_COLORS.header }]}>
        <Text style={[styles.cell, styles.headerCell, { width: 778, color: '#FFFFFF' }]}>GENERAL INFORMATION</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.row} wrap={false}>
          <Text style={[styles.cell, styles.bold, { width: 200, backgroundColor: SEDG_GENERAL_COLORS.label }]}>{row.label}</Text>
          <Text style={[styles.cell, { width: 578 }, row.value ? {} : styles.empty]}>{printable(row.value) || NOT_REPORTED}</Text>
        </View>
      ))}
    </View>
  )
}

function Footer({ input }: { input: PdfInput }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {input.companyName} · SEDG disclosure {input.year} · Prepared with Sustainability Hub on {input.generatedOn}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}

/** One pillar on its own page(s), like the template's sheets; the table header repeats on each of its pages */
function PillarPage({ input, pillar, disclosures }: { input: PdfInput } & PdfInput['pillars'][number]) {
  const colors = SEDG_COLORS[pillar]
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View fixed style={{ borderTopWidth: 0.75, borderLeftWidth: 0.75, borderColor: BORDER }}>
        <View style={[styles.row, { backgroundColor: colors.basic }]}>
          <Text style={[styles.cell, styles.headerCell, { width: 778, color: textOn(colors.basic) }]}>
            {SEDG_PILLAR_LABELS[pillar].toUpperCase()} DISCLOSURES
          </Text>
        </View>
        <View style={styles.row}>
          {(['Code', 'Level', 'Topic', 'Topic description', 'Indicator', 'Input', 'Unit'] as const).map((label, index) => (
            <Text key={label} style={[styles.cell, styles.headerCell, { width: Object.values(COLUMNS)[index] }]}>
              {label}
            </Text>
          ))}
        </View>
      </View>
      {/* No border around the rows: a block moved to the next page would leave a line to the bottom of this one */}
      <View>
        {disclosures.map((disclosure) => {
          const fill = colors[disclosure.level]
          const ink = textOn(fill)
          return (
            // One block per disclosure: its Code/Level/Topic cells span all its indicator rows, as in the template
            <View key={disclosure.code} style={styles.row} wrap={disclosure.rows.length > 8}>
              <Text style={[styles.cell, styles.bold, { width: COLUMNS.code, backgroundColor: fill, color: ink, borderLeftWidth: 0.75 }]}>
                {disclosure.code}
              </Text>
              <Text style={[styles.cell, styles.bold, { width: COLUMNS.level, backgroundColor: fill, color: ink }]}>
                {SEDG_LEVEL_LABELS[disclosure.level]}
              </Text>
              <Text style={[styles.cell, { width: COLUMNS.topic }]}>{disclosure.topic}</Text>
              <Text style={[styles.cell, { width: COLUMNS.title }]}>{disclosure.title}</Text>
              <View style={{ width: COLUMNS.indicator + COLUMNS.value + COLUMNS.unit }}>
                {disclosure.rows.map((row, index) => (
                  <View key={index} style={[styles.row, { flexGrow: 1 }]} wrap={false}>
                    <Text style={[styles.cell, { width: COLUMNS.indicator }]}>{row.indicator}</Text>
                    <Text style={[styles.cell, { width: COLUMNS.value }, row.value ? {} : styles.empty]}>
                      {printable(row.value) || NOT_REPORTED}
                    </Text>
                    <Text style={[styles.cell, { width: COLUMNS.unit }]}>{row.unit}</Text>
                  </View>
                ))}
              </View>
            </View>
          )
        })}
      </View>
      <Footer input={input} />
    </Page>
  )
}

export function SedgDocument(input: PdfInput) {
  const levelText =
    input.level === 'basic'
      ? 'Basic'
      : input.level === 'intermediate'
        ? 'Intermediate (includes Basic)'
        : 'Advanced (includes Basic and Intermediate)'
  return (
    <Document title={`SEDG disclosure ${input.year} - ${input.companyName}`} author={input.companyName} creator="Sustainability Hub" producer="Sustainability Hub">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.title}>
          <Text style={styles.titleText}>SEDG DISCLOSURE TABLE</Text>
          <Text style={styles.subtitle}>
            {input.companyName} · {input.year} · Simplified ESG Disclosure Guide (SEDG) Version 2 · Level: {levelText}
          </Text>
        </View>
        <Text style={styles.statement}>
          This data report represents our company&apos;s disclosures as guided by the Simplified ESG Disclosure Guide (SEDG). It
          contains information that is true to the best of our knowledge at the time of publication.
        </Text>
        <GeneralTable rows={input.general} />
        <Footer input={input} />
      </Page>
      {input.pillars.map((pillar) => (
        <PillarPage key={pillar.pillar} input={input} {...pillar} />
      ))}
    </Document>
  )
}
