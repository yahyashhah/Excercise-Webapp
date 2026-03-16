interface RoleGuardProps {
  allowedRoles: ("CLINICIAN" | "PATIENT")[];
  userRole: "CLINICIAN" | "PATIENT";
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowedRoles, userRole, children, fallback = null }: RoleGuardProps) {
  if (!allowedRoles.includes(userRole)) return <>{fallback}</>;
  return <>{children}</>;
}
