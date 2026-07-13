import { redirect } from "next/navigation";

export default function AdminEmailVerificationRedirect() {
  redirect("/admin/email/verification");
}
