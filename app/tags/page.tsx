import Link from "next/link";
import { enforceSingleUserModeForGuestPage } from "@/lib/auth";
import { listTagStats } from "@/lib/db";

export default async function TagsPage() {
  await enforceSingleUserModeForGuestPage();
  const tags = listTagStats();

  return (
    <div className="container page-content taxonomy-page">
      <div className="page-heading-row">
        <h1>标签</h1>
      </div>

      <section className="card tag-cloud">
        {tags.length === 0 ? (
          <p className="empty-row">暂无可用标签</p>
        ) : (
          tags.map((item) => (
            <Link className="tag-pill" href={`/tags/${encodeURIComponent(item.tag)}`} key={item.tag}>
              <span>{item.tag}</span>
              <small>{item.count}</small>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
