import { getLoggedInUser } from "../lib/appwrite";
import { redirect } from "next/navigation";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
    const user = await getLoggedInUser();

    if (!user) {
        redirect("/login");
    }

    return <>{children}</>;
}