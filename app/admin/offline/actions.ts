"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import { adminDeleteOfflineJob } from "@/lib/db";

export async function adminDeleteOfflineJobAction(jobId: number): Promise<void> {
  await requireAdminUser();
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return;
  }
  adminDeleteOfflineJob(jobId);
  revalidatePath("/admin/offline");
  revalidatePath("/my/offline");
}
