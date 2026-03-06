"use client";

import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { MAX_TAG_COUNT, MAX_TAG_LENGTH, getFirstTagExceedingLength, parseTagsInput } from "@/lib/tags";

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
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const visibleImages = useMemo(
    () => images.filter((img) => !removeIds.includes(img.id)),
    [images, removeIds],
  );

  const remainSlots = Math.max(MAX_IMAGE_COUNT - visibleImages.length, 0);
  const imageLimitExceeded = visibleImages.length + newImages.length > MAX_IMAGE_COUNT;

  const syncImageInput = (nextImages: File[]) => {
    const input = imageInputRef.current;
    if (!input) {
      return;
    }
    const dt = new DataTransfer();
    nextImages.forEach((img) => dt.items.add(img));
    input.files = dt.files;
  };

  const appendImages = (selected: File[]) => {
    if (selected.length === 0) {
      return;
    }
    const merged = [...newImages, ...selected];
    setNewImages(merged);
    syncImageInput(merged);

    if (visibleImages.length + merged.length > MAX_IMAGE_COUNT) {
      setError(`最多上传 ${MAX_IMAGE_COUNT} 张图片`);
    } else {
      setError((current) => (current === `最多上传 ${MAX_IMAGE_COUNT} 张图片` ? null : current));
    }
  };

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    const formData = new FormData(event.currentTarget);
    const tagsRaw = String(formData.get("tags") ?? "");
    const parsedTags = parseTagsInput(tagsRaw);
    const exceededTag = getFirstTagExceedingLength(parsedTags);
    if (exceededTag) {
      event.preventDefault();
      setError(`标签“${exceededTag}”超过 ${MAX_TAG_LENGTH} 字符，请缩短`);
      return;
    }
    if (imageLimitExceeded) {
      event.preventDefault();
      setError(`最多上传 ${MAX_IMAGE_COUNT} 张图片`);
      return;
    }
    setError(null);
  };

  return (
    <form action={actionUrl} className="card upload-form" encType="multipart/form-data" method="POST" onSubmit={onSubmit}>
      <div className="field-grid">
        <div className="field-group span-2">
          <label htmlFor="name">标题</label>
          <input defaultValue={name} id="name" name="name" required type="text" />
        </div>

        <div className="field-group span-2">
          <label htmlFor="tags">标签</label>
          <input
            defaultValue={tags}
            id="tags"
            name="tags"
            placeholder={`最多 ${MAX_TAG_COUNT} 个标签，单个标签不超过 ${MAX_TAG_LENGTH} 个字符。`}
            type="text"
          />
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
          <label
            className={`dropzone image-dropzone${remainSlots <= 0 ? " is-disabled" : ""}`}
            htmlFor="images"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (remainSlots <= 0) {
                return;
              }
              appendImages(Array.from(event.dataTransfer.files ?? []));
            }}
          >
            <input
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              disabled={remainSlots <= 0}
              id="images"
              multiple
              name="images"
              onChange={(event) => {
                appendImages(Array.from(event.target.files ?? []));
              }}
              ref={imageInputRef}
              type="file"
            />
            <ImagePlus size={30} />
            <p>
              <strong>点击上传或拖拽图片至此</strong>
            </p>
            <small>支持 jpg/png/webp/svg</small>
            <small>单张图片大小：{maxTorrentImageUploadMb}MB，最多 {MAX_IMAGE_COUNT} 张</small>
            <small>{newImages.length > 0 ? `已选择 ${newImages.length} 张图片` : "未选择图片"}</small>
            {imageLimitExceeded ? <small>已超过上限，请删除至 {MAX_IMAGE_COUNT} 张以内</small> : null}
          </label>
          {newImages.length > 0 ? (
            <div className="image-preview-grid">
              {newImages.map((image, index) => (
                <div className="image-preview-item" key={`${image.name}-${index}`}>
                  <div className="image-preview-thumb">
                    <img alt={image.name} src={URL.createObjectURL(image)} />
                  </div>
                  <p title={image.name}>{image.name}</p>
                  <button
                    onClick={() => {
                      const next = newImages.filter((_, i) => i !== index);
                      setNewImages(next);
                      syncImageInput(next);
                      if (visibleImages.length + next.length <= MAX_IMAGE_COUNT) {
                        setError((current) => (current === `最多上传 ${MAX_IMAGE_COUNT} 张图片` ? null : current));
                      }
                    }}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="form-actions">
        <button className="primary-btn" type="submit">
          保存修改
        </button>
      </div>
    </form>
  );
}
