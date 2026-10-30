import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · Print Catalogue" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-2xl font-semibold">
          Print Catalogue
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
