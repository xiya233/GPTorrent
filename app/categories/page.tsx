import Link from "next/link";
import { enforceSingleUserModeForGuestPage } from "@/lib/auth";
import { listCategoryStats } from "@/lib/db";

export default async function CategoriesPage() {
  await enforceSingleUserModeForGuestPage();
  const categories = listCategoryStats();

  return (
    <div className="container page-content taxonomy-page">
      <div className="page-heading-row">
        <h1>分类</h1>
      </div>

      <section className="card taxonomy-grid">
        {categories.map((item) => (
          <Link className="taxonomy-item" href={`/categories/${item.category}`} key={item.category}>
            <strong>{item.category}</strong>
            <span>{item.count.toLocaleString("zh-CN")} 个种子</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
