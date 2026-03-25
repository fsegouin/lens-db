import { redirect } from "next/navigation";

// Admin login is handled by the regular user login flow.
// Admins are users with role "admin" — no separate password needed.
export default function AdminLoginPage() {
  redirect("/login");
}
