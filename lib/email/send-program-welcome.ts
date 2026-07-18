import * as React from "react";
import { getResend } from "@/lib/email/resend";
import { ProgramWelcomeEmail } from "@/lib/email/templates/program-welcome";

export async function sendProgramWelcomeEmail(args: {
  to: string;
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
}): Promise<void> {
  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@inmotusrx.com",
    to: args.to,
    subject: args.isNewAccount
      ? `Welcome — set up your ${args.programName} account`
      : `Your new program: ${args.programName}`,
    react: React.createElement(ProgramWelcomeEmail, {
      firstName: args.firstName,
      programName: args.programName,
      loginUrl: args.loginUrl,
      isNewAccount: args.isNewAccount,
    }),
  });
}
