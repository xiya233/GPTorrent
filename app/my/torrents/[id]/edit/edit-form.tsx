"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type EditTorrentFormProps = {
  actionUrl: string;
  name: string;
  tags: string;
  description: string;
  maxTorrentImageUploadMb: number;
  images: Array<{
    id: number;
    url: string;
  }>;
};

const MAX_IMAGE_COUNT = 9;

export function EditTorrentForm({
  actionUrl,
  name,
  tags,
  description,
  maxTorrentImageUploadMb,
  images,
}: EditTorrentFormProps) {
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);

  const visibleImages = useMemo(
    () => images.filter((img) => !removeIds.includes(img.id)),
    [images, removeIds],
  );

  const remainSlots = Math.max(MAX_IMAGE_COUNT - visibleImages.length, 0);

  return (
    <form action={actionUrl} className="card upload-form" encType="multipart/form-data" method="POST">
      <div className="field-grid">
        <div className="field-group span-2">
          <label htmlFor="name">标题</label>
          <input defaultValue={name} id="name" name="name" required type="text" />
        </div>

        <div className="field-group span-2">
          <label htmlFor="tags">标签</label>
          <input defaultValue={tags} id="tags" name="tags" type="text" />
        </div>

        <div className="field-group span-2">
          <label htmlFor="description">描述</label>
          <textarea defaultValue={description} id="description" name="description" required rows={8} />
        </div>

        <div className="field-group span-2">
          <label>已有图片</label>
          {visibleImages.length === 0 ? (
            <p className="muted">暂无图片</p>
          ) : (
            <div className="detail-image-grid">
              {visibleImages.map((img) => (
                <div className="detail-image-item" key={img.id}>
                  <Image alt="torrent image" fill src={img.url} unoptimized />
                  <button
                    className="image-remove-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      setRemoveIds((prev) => [...prev, img.id]);
                    }}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
          <input name="removeImageIds" type="hidden" value={removeIds.join(",")} />
        </div>

        <div className="field-group span-2">
          <label htmlFor="images">新增图片（可再上传 {remainSlots} 张）</label>
          <input
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            disabled={remainSlots <= 0}
            id="images"
            multiple
            name="images"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).slice(0, remainSlots);
              setNewImages(files);
            }}
            type="file"
          />
          <small>图片单张上限 {maxTorrentImageUploadMb}MB，保存后自动转换为 WebP。</small>
          {newImages.length > 0 ? (
            <div className="new-image-list">
              {newImages.map((img) => (
                <p className="muted" key={`${img.name}-${img.size}`}>
                  {img.name}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="form-actions">
        <button className="primary-btn" type="submit">
          保存修改
        </button>
      </div>
    </form>
  );
}
