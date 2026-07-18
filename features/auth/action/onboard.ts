"use server";

import {prisma} from "@/lib/db";
import {currentUser} from "@clerk/nextjs/server";

/**
 * Syncs the signed-in Clerk user into the local Prisma `User` table (upsert).
 *
 * @returns The created or updated Prisma user record.
 * @throws {Error} When no Clerk session is present.
 */
export async function onBoard() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw new Error("Unauthorized");
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? null;

  try {
    return await prisma.user.upsert({
      where: {clerkId: clerkUser.id},
      create: {
        clerkId: clerkUser.id,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      },
      update: {
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      },
    });
  } catch (error) {
    console.log("Onboarding Error:", error);
    throw new Error("Failed to sync user");
  }
}
