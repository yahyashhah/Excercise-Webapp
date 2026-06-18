import * as React from 'react'

interface ShareProgramEmailProps {
  programName: string
  clientName: string | null
  senderName: string
  pdfLink: string
  organizationName?: string
}

export function ShareProgramEmail({
  programName,
  clientName,
  senderName,
  pdfLink,
  organizationName = 'INMOTUS RX',
}: ShareProgramEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Your Exercise Plan</title>
      </head>
      <body style={styles.body}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.outerTable}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '40px 16px' }}>
                <table width="100%" cellPadding={0} cellSpacing={0} style={styles.card}>
                  <tbody>
                    <tr>
                      <td style={styles.headerBar}>
                        <p style={styles.brandName}>{organizationName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.bodyPad}>
                        <p style={styles.greeting}>
                          {clientName ? `Hi ${clientName},` : 'Hello,'}
                        </p>
                        <p style={styles.intro}>
                          {senderName} has shared your exercise plan with you.
                        </p>
                        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.detailsCard}>
                          <tbody>
                            <tr>
                              <td style={styles.detailsPad}>
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
                                  {programName}
                                </p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginTop: 28, textAlign: 'center' }}>
                          <tbody>
                            <tr>
                              <td align="center">
                                <a href={pdfLink} style={styles.ctaButton}>
                                  Download Exercise Plan (PDF)
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={styles.footnote}>
                          This link opens directly to your exercise plan. If you have questions, please contact your care team.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>
                          &copy; {new Date().getFullYear()} {organizationName}. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: { backgroundColor: '#f4f6f9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: 0 },
  outerTable: { backgroundColor: '#f4f6f9', maxWidth: '600px', margin: '0 auto' },
  card: { backgroundColor: '#ffffff', borderRadius: '12px', maxWidth: '560px', width: '100%', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  headerBar: { backgroundColor: '#2563eb', padding: '24px 32px' },
  brandName: { color: '#ffffff', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '0.5px' },
  bodyPad: { padding: '32px' },
  greeting: { color: '#111827', fontSize: '20px', fontWeight: 600, margin: '0 0 12px 0' },
  intro: { color: '#4b5563', fontSize: '15px', lineHeight: '1.6', margin: '0 0 24px 0' },
  detailsCard: { backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e5e7eb' },
  detailsPad: { padding: '20px 24px' },
  ctaButton: { backgroundColor: '#2563eb', borderRadius: '8px', color: '#ffffff', display: 'inline-block', fontSize: '15px', fontWeight: 600, padding: '12px 28px', textDecoration: 'none' },
  footnote: { color: '#9ca3af', fontSize: '13px', lineHeight: '1.5', marginTop: '28px', marginBottom: 0 },
  footer: { backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '20px 32px' },
  footerText: { color: '#9ca3af', fontSize: '12px', lineHeight: '1.5', margin: '0 0 4px 0' },
}
