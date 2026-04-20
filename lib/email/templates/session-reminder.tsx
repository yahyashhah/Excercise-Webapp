import * as React from "react";

interface SessionReminderEmailProps {
  patientName: string;
  sessionDate: string;
  sessionTime: string;
  workoutName: string;
  sessionLink: string;
  clinicName?: string;
}

/**
 * React Email template for session reminder notifications.
 * Rendered server-side by Resend and sent as HTML email.
 */
export function SessionReminderEmail({
  patientName,
  sessionDate,
  sessionTime,
  workoutName,
  sessionLink,
  clinicName = "INMOTUS RX",
}: SessionReminderEmailProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Session Reminder</title>
      </head>
      <body style={styles.body}>
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={styles.outerTable}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: "40px 16px" }}>
                {/* Card container */}
                <table
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={styles.card}
                >
                  <tbody>
                    {/* Header bar */}
                    <tr>
                      <td style={styles.headerBar}>
                        <p style={styles.brandName}>{clinicName}</p>
                      </td>
                    </tr>

                    {/* Body */}
                    <tr>
                      <td style={styles.bodyPad}>
                        <p style={styles.greeting}>
                          Hi {patientName},
                        </p>
                        <p style={styles.intro}>
                          This is a friendly reminder that you have a workout
                          session scheduled for tomorrow.
                        </p>

                        {/* Session details card */}
                        <table
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          style={styles.detailsCard}
                        >
                          <tbody>
                            <tr>
                              <td style={styles.detailsPad}>
                                <DetailRow label="Workout" value={workoutName} />
                                <DetailRow label="Date" value={sessionDate} />
                                <DetailRow label="Time" value={sessionTime} />
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        {/* CTA button */}
                        <table
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{ marginTop: "28px", textAlign: "center" }}
                        >
                          <tbody>
                            <tr>
                              <td align="center">
                                <a href={sessionLink} style={styles.ctaButton}>
                                  View Your Session
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <p style={styles.footnote}>
                          If you have any questions or need to reschedule,
                          please reach out to your care team through the
                          platform.
                        </p>
                      </td>
                    </tr>

                    {/* Footer */}
                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>
                          &copy; {new Date().getFullYear()} {clinicName}. All
                          rights reserved.
                        </p>
                        <p style={styles.footerText}>
                          You received this email because you have a session
                          scheduled on the {clinicName} platform.
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
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <table
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ marginBottom: "12px" }}
    >
      <tbody>
        <tr>
          <td style={styles.detailLabel}>{label}</td>
          <td style={styles.detailValue}>{value}</td>
        </tr>
      </tbody>
    </table>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: "#f4f6f9",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: 0,
  },
  outerTable: {
    backgroundColor: "#f4f6f9",
    maxWidth: "600px",
    margin: "0 auto",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    maxWidth: "560px",
    width: "100%",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  headerBar: {
    backgroundColor: "#2563eb",
    padding: "24px 32px",
  },
  brandName: {
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "0.5px",
  },
  bodyPad: {
    padding: "32px",
  },
  greeting: {
    color: "#111827",
    fontSize: "20px",
    fontWeight: 600,
    margin: "0 0 12px 0",
  },
  intro: {
    color: "#4b5563",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 24px 0",
  },
  detailsCard: {
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    border: "1px solid #e5e7eb",
  },
  detailsPad: {
    padding: "20px 24px",
  },
  detailLabel: {
    color: "#6b7280",
    fontSize: "13px",
    fontWeight: 500,
    width: "80px",
    paddingBottom: "4px",
    verticalAlign: "top",
  },
  detailValue: {
    color: "#111827",
    fontSize: "14px",
    fontWeight: 600,
    paddingBottom: "4px",
    verticalAlign: "top",
  },
  ctaButton: {
    backgroundColor: "#2563eb",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 28px",
    textDecoration: "none",
    letterSpacing: "0.2px",
  },
  footnote: {
    color: "#9ca3af",
    fontSize: "13px",
    lineHeight: "1.5",
    marginTop: "28px",
    marginBottom: 0,
  },
  footer: {
    backgroundColor: "#f9fafb",
    borderTop: "1px solid #e5e7eb",
    padding: "20px 32px",
  },
  footerText: {
    color: "#9ca3af",
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "0 0 4px 0",
  },
};
