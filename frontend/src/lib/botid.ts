export const botIdProtectedRoutes = [
  {
    path: "/api/submissions",
    method: "POST" as const,
  },
  {
    path: "/api/chat",
    method: "POST" as const,
  },
  {
    path: "/api/auth/register",
    method: "POST" as const,
  },
  {
    path: "/api/auth/resend-verification",
    method: "POST" as const,
  },
  {
    path: "/api/auth/forgot-password",
    method: "POST" as const,
  },
];
