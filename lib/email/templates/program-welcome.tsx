import * as React from "react";

export function ProgramWelcomeEmail(props: {
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
}) {
  const { firstName, programName, loginUrl, isNewAccount } = props;
  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", color: "#111", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 20 }}>
        {firstName ? `Welcome, ${firstName}!` : "Welcome!"}
      </h1>
      <p>Your purchase is confirmed and <strong>{programName}</strong> is ready in your account.</p>
      <p>
        {isNewAccount
          ? "Click below to set your password and start your program:"
          : "Click below to log in and view your new program:"}
      </p>
      <p>
        <a
          href={loginUrl}
          style={{ background: "#2563eb", color: "#fff", padding: "12px 20px", borderRadius: 8, textDecoration: "none", display: "inline-block" }}
        >
          {isNewAccount ? "Set Up My Account" : "Access My Program"}
        </a>
      </p>
      <p style={{ fontSize: 12, color: "#666" }}>
        If the button doesn't work, copy this link into your browser:<br />
        {loginUrl}
      </p>
    </div>
  );
}
