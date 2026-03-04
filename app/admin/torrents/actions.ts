"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import { setTorrentTrusted } from "@/lib/db";

export async function adminToggleTorrentTrustedAction(torrentId: number, trusted: boolean): Promise<void> {
  await requireAdminUser();
  if (!Number.isInteger(torrentId) || torrentId <= 0) {
    return;
  }

  setTorrentTrusted(torrentId, trusted);
  revalidatePath("/admin/torrents");
  revalidatePath("/");
  revalidatePath("/categories");
}
