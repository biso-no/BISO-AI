import { createAdminClient } from "../lib/appwrite";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const secret = url.searchParams.get("secret");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

    if (!userId || !secret) {
        return NextResponse.redirect(new URL("/login", baseUrl!));
    }

    const { account } = await createAdminClient();
    const session = await account.createSession(userId, secret);

    (await cookies()).set("x-bisoai-session", session.secret, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
    });

    return NextResponse.redirect(new URL("/chat", baseUrl!));
}