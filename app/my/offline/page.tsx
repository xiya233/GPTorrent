import { MyOfflineTable } from "@/components/my-offline-table";
import { requireActiveUser } from "@/lib/auth";
import { getOfflineQuotaSnapshot, listMyOfflineJobs, listOfflineFilesByJobId, type OfflineJobStatus } from "@/lib/db";

type MyOfflinePageProps = {
  searchParams: Promise<{
    q?: string;
    status?: OfflineJobStatus | "";
  }>;
};

export default async function MyOfflinePage({ searchParams }: MyOfflinePageProps) {
  const user = await requireActiveUser();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "";

  const jobs = listMyOfflineJobs(user.id, {
    q,
    status: (status as OfflineJobStatus | "") ?? "",
  });
  const quota = getOfflineQuotaSnapshot(user.id);

  const items = jobs.map((row) => ({
    ...row,
    files: row.job_status === "completed" ? listOfflineFilesByJobId(row.job_id) : [],
  }));

  return (
    <div className="container page-content admin-page">
      <div className="page-heading-row">
        <h1>离线下载</h1>
      </div>

      <form className="admin-filter-row admin-filter-wide" method="GET">
        <input defaultValue={q} name="q" placeholder="搜索任务标题" type="text" />
        <select defaultValue={status} name="status">
          <option value="">全部状态</option>
          <option value="queued">queued</option>
          <option value="downloading">downloading</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
        </select>
        <button className="secondary-btn" type="submit">
          筛选
        </button>
      </form>

      <MyOfflineTable initialItems={items} initialQ={q} initialQuota={quota} initialStatus={status} />
    </div>
  );
}
