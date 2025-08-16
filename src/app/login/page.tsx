import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { login } from "../lib/appwrite";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import SubmitButton from "../components/SubmitButton";

const loginSchema = z.object({
    email: z.string().email(),
});

async function requestMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();

    const parsed = loginSchema.safeParse({ email });
    if (!parsed.success) {
        redirect(`/login?error=invalid&email=${encodeURIComponent(email)}`);
    }

    try {
        const response = await login(email);
        console.log(response);
        redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
    } catch (error) {
        redirect(`/login?error=send_failed&email=${encodeURIComponent(email)}`);
    }
}

function maskEmail(targetEmail: string) {
    const [user, domain] = targetEmail.split("@");
    if (!user || !domain) return targetEmail;
    const maskedUser = user.length <= 2 ? "*".repeat(user.length) : `${user[0]}${"*".repeat(Math.max(1, user.length - 2))}${user[user.length - 1]}`;
    return `${maskedUser}@${domain}`;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const params = await searchParams;
    const sent = params?.sent === "1";
    const emailParam = typeof params?.email === "string" ? params.email : "";
    const error = typeof params?.error === "string" ? params.error : "";

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Sign in to BisoAI</CardTitle>
                    <CardDescription>
                        {sent ? "We sent you a secure sign-in link." : "Enter your email and we'll send you a secure sign-in link."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {sent ? (
                        <div className="grid gap-4 text-center">
                            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-primary">
                                    <path d="M1.5 8.67v8.58a2.25 2.25 0 0 0 2.25 2.25h16.5a2.25 2.25 0 0 0 2.25-2.25V8.67l-8.906 5.218a3.75 3.75 0 0 1-3.188 0L1.5 8.67Z" />
                                    <path d="M22.5 6.908V6.75A2.25 2.25 0 0 0 20.25 4.5H3.75A2.25 2.25 0 0 0 1.5 6.75v.158l9.227 5.404a2.25 2.25 0 0 0 1.546 0L22.5 6.908Z" />
                                </svg>
                            </div>
                            <div className="grid gap-1">
                                <h3 className="text-lg font-medium">Check your email</h3>
                                <p className="text-sm text-muted-foreground">We sent a sign-in link to {maskEmail(emailParam)}.</p>
                            </div>
                            <form action={requestMagicLink} className="grid gap-3">
                                <input type="hidden" name="email" value={emailParam} />
                                <SubmitButton pendingText="Resending…" variant="secondary">Resend link</SubmitButton>
                            </form>
                            <div className="text-sm text-muted-foreground">
                                Wrong email? <Link href="/login" className="underline underline-offset-4">Use another address</Link>
                            </div>
                        </div>
                    ) : (
                        <form action={requestMagicLink} className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" name="email" type="email" placeholder="you@company.com" defaultValue={emailParam} required />
                                {error === "invalid" && (
                                    <p className="text-sm text-destructive">Please enter a valid email address.</p>
                                )}
                                {error === "send_failed" && (
                                    <p className="text-sm text-destructive">We couldn’t send the link. Please try again.</p>
                                )}
                            </div>
                            <Button type="submit" >Send magic link</Button>
                        </form>
                    )}
                </CardContent>
                <CardFooter className="flex-col items-start gap-2">
                    <p className="text-xs text-muted-foreground">By continuing, you agree to receive a single-use sign-in link to your email.</p>
                </CardFooter>
            </Card>
        </div>
    );
}