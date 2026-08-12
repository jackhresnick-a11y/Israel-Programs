import { redirect } from "next/navigation";

export default function AdminFlowIndexRedirect() {
  redirect("/admin/flow/questions");
}
