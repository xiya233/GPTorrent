"use client";
import { useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";

type UploadFormProps = {
  isLoggedIn: boolean;
  allowGuestUpload: boolean;
};

type UploadMetrics = {
  percent: number;
  loaded: number;
  total: number;
  speedBytes: number;
};

const MAX_IMAGE_COUNT = 9;

function formatBytes(sizeBytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = sizeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex <= 1 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

export function UploadForm({ isLoggedIn, allowGuestUpload }: UploadFormProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [metrics, setMetrics] = useState<UploadMetrics | null>(null);

  const guestDisabled = !isLoggedIn && !allowGuestUpload;

  const syncImageInput = (nextImages: File[]) => {
    if (!imageInputRef.current) {
      return;
    }

    const dt = new DataTransfer();
    nextImages.forEach((img) => dt.items.add(img));
    imageInputRef.current.files = dt.files;
  };

  const onFileChanged = (nextFile: File | null) => {
    setError(null);
    setMetrics(null);
    setFile(nextFile);
  };

  const onInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    onFileChanged(event.target.files?.[0] ?? null);
  };

  const onImageInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) {
      return;
    }

    const merged = [...images, ...selected].slice(0, MAX_IMAGE_COUNT);
    setImages(merged);
    syncImageInput(merged);
  };

  const removeImage = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    setImages(next);
    syncImageInput(next);
  };

  const onDrop: React.DragEventHandler<HTMLLabelElement> = (event) => {
    event.preventDefault();
    if (uploading || guestDisabled) {
      return;
    }

    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (!dropped) {
      return;
    }

    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(dropped);
      inputRef.current.files = dt.files;
    }

    onFileChanged(dropped);
  };

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (uploading || guestDisabled) {
      return;
    }

    if (!file) {
      setError("请先选择一个 .torrent 文件");
      return;
    }

    const formData = new FormData(form);
    const xhr = new XMLHttpRequest();
    const startedAt = performance.now();

    setError(null);
    setUploading(true);
    setMetrics({
      percent: 0,
      loaded: 0,
      total: file.size,
      speedBytes: 0,
    });

    xhr.open("POST", "/api/upload", true);
    xhr.responseType = "json";

    xhr.upload.onprogress = (progressEvent) => {
      if (!progressEvent.lengthComputable) {
        return;
      }

      const now = performance.now();
      const elapsedSec = Math.max((now - startedAt) / 1000, 0.001);
      const speedBytes = progressEvent.loaded / elapsedSec;

      setMetrics({
        percent: Math.min((progressEvent.loaded / progressEvent.total) * 100, 100),
        loaded: progressEvent.loaded,
        total: progressEvent.total,
        speedBytes,
      });
    };

    xhr.onload = () => {
      setUploading(false);

      const payload = (xhr.response ?? {}) as { error?: string; redirect?: string };
      if (xhr.status >= 200 && xhr.status < 300) {
        window.location.href = payload.redirect ?? "/";
        return;
      }

      setError(payload.error ?? "上传失败，请稍后重试");
    };

    xhr.onerror = () => {
      setUploading(false);
      setError("网络异常，上传失败");
    };

    xhr.send(formData);
  };

  return (
    <form className="upload-form" onSubmit={onSubmit}>
      {!isLoggedIn ? <p className="hint-text">当前为游客上传，发布者会显示为“匿名用户”。</p> : null}
      {guestDisabled ? <p className="form-error">管理员已关闭游客上传，请先登录后上传。</p> : null}

      <div className="field-group">
        <label htmlFor="torrentFile">种子文件</label>
        <label className="dropzone" htmlFor="torrentFile" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <input
            accept=".torrent"
            disabled={uploading || guestDisabled}
            id="torrentFile"
            name="torrentFile"
            onChange={onInputChange}
            ref={inputRef}
            required
            type="file"
          />

          {!file ? (
            <>
              <Upload size={34} />
              <p>
                <strong>点击上传或拖拽文件至此</strong>
              </p>
              <small>仅支持 .torrent 文件 (最大 10MB)</small>
            </>
          ) : (
            <div className="selected-file-wrap">
              <p className="selected-file-name">{file.name}</p>
              <p className="selected-file-meta">{formatBytes(file.size)}</p>
              {!uploading ? (
                <button
                  className="clear-file-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    if (inputRef.current) {
                      inputRef.current.value = "";
                    }
                    onFileChanged(null);
                  }}
                  type="button"
                >
                  <X size={14} />
                  取消选择
                </button>
              ) : null}
            </div>
          )}
        </label>

        {metrics ? (
          <div className="upload-progress-wrap">
            <div className="upload-progress-meta">
              <span>上传进度 {metrics.percent.toFixed(1)}%</span>
              <span>
                {formatBytes(metrics.loaded)} / {formatBytes(metrics.total)}
              </span>
            </div>
            <div className="upload-progress-track">
              <div className="upload-progress-bar" style={{ width: `${metrics.percent}%` }} />
            </div>
            <p className="upload-speed">当前速度: {formatBytes(metrics.speedBytes)}/s</p>
          </div>
        ) : null}
      </div>

      <div className="field-grid">
        <div className="field-group span-2">
          <label htmlFor="name">种子名称</label>
          <input
            disabled={uploading || guestDisabled}
            id="name"
            name="name"
            placeholder="[字幕组] 标题 - 集数 [分辨率] [编码]"
            required
            type="text"
          />
        </div>

        <div className="field-group">
          <label htmlFor="category">分类</label>
          <select defaultValue="" disabled={uploading || guestDisabled} id="category" name="category" required>
            <option disabled value="">
              选择分类
            </option>
            <option value="动画">动画</option>
            <option value="电影">电影</option>
            <option value="电视剧">电视剧</option>
            <option value="音乐">音乐</option>
            <option value="游戏">游戏</option>
            <option value="软件">软件</option>
            <option value="书籍">书籍</option>
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="tags">标签 (逗号分隔)</label>
          <input disabled={uploading || guestDisabled} id="tags" name="tags" placeholder="1080p, HEVC, FLAC" type="text" />
        </div>

        <div className="field-group span-2">
          <label htmlFor="description">描述</label>
          <textarea
            disabled={uploading || guestDisabled}
            id="description"
            name="description"
            placeholder="输入种子的详细描述..."
            required
            rows={8}
          />
          <small>可以使用 Markdown 进行格式化。</small>
        </div>

        <div className="field-group span-2">
          <label htmlFor="images">种子图片（最多9张）</label>
          <input
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            disabled={uploading || guestDisabled || images.length >= MAX_IMAGE_COUNT}
            id="images"
            multiple
            name="images"
            onChange={onImageInputChange}
            ref={imageInputRef}
            type="file"
          />
          <small>支持 jpg/png/webp/svg，单张最大 2MB。</small>

          {images.length > 0 ? (
            <div className="image-preview-grid">
              {images.map((image, index) => (
                <div className="image-preview-item" key={`${image.name}-${index}`}>
                  <div className="image-preview-thumb">
                    <img alt={image.name} src={URL.createObjectURL(image)} />
                  </div>
                  <p title={image.name}>{image.name}</p>
                  <button disabled={uploading} onClick={() => removeImage(index)} type="button">
                    删除
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="image-empty-hint">
              <ImagePlus size={16} />
              <span>未选择图片</span>
            </div>
          )}
        </div>

        {isLoggedIn ? (
          <label className="checkbox-row span-2" htmlFor="anonymous">
            <input disabled={uploading || guestDisabled} id="anonymous" name="anonymous" type="checkbox" />
            <span>
              <strong>匿名上传</strong>
              <small>上传后将不显示您的用户名。</small>
            </span>
          </label>
        ) : (
          <input name="anonymous" type="hidden" value="on" />
        )}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="form-actions">
        <button
          className="secondary-btn"
          disabled={uploading}
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.value = "";
            }
            if (imageInputRef.current) {
              imageInputRef.current.value = "";
            }
            setError(null);
            setMetrics(null);
            setFile(null);
            setImages([]);
          }}
          type="reset"
        >
          取消
        </button>
        <button className="primary-btn" disabled={uploading || guestDisabled} type="submit">
          {uploading ? "上传中..." : "提交种子"}
        </button>
      </div>
    </form>
  );
}
