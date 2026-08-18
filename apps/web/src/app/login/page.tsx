import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getServerSession } from "@/server/session";

export default async function LoginPage() {
  const session = await getServerSession();
  if (!session.enabled || session.operator) {
    redirect("/contacts");
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <LoginForm />
    </div>
  );
}
