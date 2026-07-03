"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionOrganization, SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";

export async function createBorrowerAction(formData: FormData) {
  const organization = await getSessionOrganization();
  if (!organization) redirect("/dashboard/login");

  const legalName = String(formData.get("legalName") ?? "").trim();
  if (!legalName) return;

  const borrower = await prisma.borrower.create({
    data: { organizationId: organization.id, legalName },
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard/borrowers/${borrower.id}`);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/dashboard/login");
}
