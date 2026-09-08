import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Verunda Team Scoutier" },
      {
        name: "description",
        content: "Sign in or create your Verunda Team Scoutier account to start generating outreach links.",
      },
      { property: "og:title", content: "Sign in — Verunda Team Scoutier" },
      {
        property: "og:description",
        content: "Sign in or create your Verunda Team Scoutier account to start generating outreach links.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot" | "check";

function friendlyAuthMessage(message: string) {
  if (/email not confirmed/i.test(message))
    return "Your email isn't confirmed yet — open the confirmation link we emailed you, or resend it below.";
  if (/invalid login credentials/i.test(message)) return "That email and password don't match.";
  if (/known to be weak|password should be/i.test(message))
    return "Please choose a stronger password — at least 8 characters with a mix of letters and numbers.";
  return message;
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function resendConfirmation() {
    if (!email.trim()) {
      toast.error("Enter your email first.");
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      toast.success("Confirmation email sent — check your inbox and spam folder.");
    } catch (error) {
      toast.error(error instanceof Error ? friendlyAuthMessage(error.message) : "Couldn't resend it.");
    } finally {
      setResending(false);
    }
  }


  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Reset link sent — check your inbox.");
        setMode("signin");
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) {
          if (/already|exists|registered/i.test(error.message)) {
            toast.error("Account already exists — sign in instead.");
            setMode("signin");
            return;
          }
          throw error;
        }
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          toast.error("Account already exists — sign in instead.");
          setMode("signin");
          return;
        }
        if (data.session && data.user) {
          const { error: profileError } = await supabase.from("profiles").insert({
            id: data.user.id,
            email: email.trim(),
            display_name: name.trim() || email.trim().split("@")[0] || "Scout",
          });
          if (profileError) throw profileError;
          navigate({ to: "/dashboard", replace: true });
          return;
        }
        window.localStorage.setItem(
          "verunda_pending_profile",
          JSON.stringify({ display_name: name.trim() }),
        );
        setMode("check");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        if (/email not confirmed/i.test(error.message)) {
          setMode("check");
          toast.error(friendlyAuthMessage(error.message));
          return;
        }
        throw error;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? friendlyAuthMessage(error.message) : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "check") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <Link to="/" className="mb-8">
          <Logo />
        </Link>
        <div className="panel w-full max-w-md p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold">Check your inbox</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We sent a confirmation link to{" "}
            <span className="font-semibold text-foreground">{email.trim() || "your email"}</span>.
            Open it to finish setting up your account, then come back and sign in. It can take a
            minute to arrive — check your spam folder too.
          </p>
          <div className="mt-6 space-y-3">
            <Button className="w-full" onClick={resendConfirmation} disabled={resending}>
              {resending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Resend confirmation email
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setMode("signin")}>
              Back to sign in
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>


      <div className="panel w-full max-w-md p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold">
          {mode === "signin" && "Welcome back"}
          {mode === "signup" && "Create your account"}
          {mode === "forgot" && "Reset your password"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "signin" && "Sign in to your Scoutier workspace."}
          {mode === "signup" && "New accounts join as members — an admin can upgrade you later."}
          {mode === "forgot" && "We'll email you a link to set a new password."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Quadri A."
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </div>
          )}


          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "signin" && "Sign in"}
            {mode === "signup" && "Create account"}
            {mode === "forgot" && "Send reset link"}
          </Button>
        </form>

        <div className="mt-5 space-y-2 text-sm text-muted-foreground">
          {mode === "signin" && (
            <>
              <button className="text-brand hover:underline" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
              <p>
                No account yet?{" "}
                <button className="text-brand hover:underline" onClick={() => setMode("signup")}>
                  Create one
                </button>
              </p>
            </>
          )}
          {mode !== "signin" && (
            <button className="text-brand hover:underline" onClick={() => setMode("signin")}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
