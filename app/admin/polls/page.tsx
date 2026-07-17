import { redirect } from "next/navigation";

export default function AdminPollsIndexRedirect() {
  redirect("/admin/polls/links");
}
