"use server";
import { Client, Account, ID } from "node-appwrite";
import { cookies } from "next/headers";
import { headers } from "next/headers";

export async function createSessionClient() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT_ID!);

  const session = (await cookies()).get("x-bisoai-session");
  if (!session || !session.value) {
    throw new Error("No session");
  }

  client.setSession(session.value);

  return {
    get account() {
      return new Account(client);
    },
  };
}

export async function createAdminClient() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

  return {
    get account() {
      return new Account(client);
    },
  };
}

export async function login(email: string) {
  try {
    const { account } = await createAdminClient();
    const origin = (await headers()).get("origin");
    const callBackUrl = origin + "/callback";

    const response = await account.createMagicURLToken(ID.unique(), email, callBackUrl);
    console.log("Response: ", response);
    return response;
  } catch (error) {
    console.error("Error: ", error);
    throw error;
  }
}

export async function loginCallback(userId: string, token: string) {
    const { account } = await createSessionClient();

    const response = await account.createSession(userId, token);

    return response;
}

export async function logout() {
    const { account } = await createSessionClient();
    const response = await account.deleteSession("current");
    (await cookies()).delete("x-bisoai-session");
    return response;
}

export async function getLoggedInUser() {
    try {
        const { account } = await createSessionClient();
        return await account.get();
    } catch (error) {
        return null;
    }
}

export async function getSession() {
    try {
      const { account } = await createSessionClient();
      return await account.getSession("current");
    } catch (error) {
      return null;
    }
}

export async function createJwtClient(jwt: string) {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT_ID!)
    .setJWT(jwt);

  return {
    get account() {
      return new Account(client);
    },
  };
}

export async function getJwtSession(jwt: string) {
  console.log("JWT: ", jwt);
  const { account } = await createJwtClient(jwt);
  console.log("Account: ", account);
  if (!account) {
    return null;
  }
  return await account.get();
}