"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { uploadTorrentAction, type UploadActionState } from "@/app/upload/actions";

const initialState: UploadActionState = {
  error: null,
};

export function UploadForm() {
  const [state, formAction, isPending] = useActionState(uploadTorrentAction, initialState);

  return (
    <form action={formAction} className="upload-form">
      <div className="field-group">
        <label htmlFor="torrentFile">种子文件</label>
        <label className="dropzone" htmlFor="torrentFile">
          <input accept=".torrent" id="torrentFile" name="torrentFile" required type="file" />
          <Upload size={34} />
          <p>
            <strong>点击上传或拖拽文件至此</strong>
          </p>
          <small>仅支持 .torrent 文件 (最大 10MB)</small>
        </label>
      </div>

      <div className="field-grid">
        <div className="field-group span-2">
          <label htmlFor="name">种子名称</label>
          <input id="name" name="name" placeholder="[字幕组] 标题 - 集数 [分辨率] [编码]" required type="text" />
        </div>

        <div className="field-group">
          <label htmlFor="category">分类</label>
          <select defaultValue="" id="category" name="category" required>
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
          <input id="tags" name="tags" placeholder="1080p, HEVC, FLAC" type="text" />
        </div>

        <div className="field-group span-2">
          <label htmlFor="description">描述</label>
          <textarea id="description" name="description" placeholder="输入种子的详细描述..." required rows={8} />
          <small>可以使用 Markdown 进行格式化。</small>
        </div>

        <label className="checkbox-row span-2" htmlFor="anonymous">
          <input id="anonymous" name="anonymous" type="checkbox" />
          <span>
            <strong>匿名上传</strong>
            <small>上传后将不显示您的用户名。</small>
          </span>
        </label>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <div className="form-actions">
        <button className="secondary-btn" disabled={isPending} type="reset">
          取消
        </button>
        <button className="primary-btn" disabled={isPending} type="submit">
          {isPending ? "提交中..." : "提交种子"}
        </button>
      </div>
    </form>
  );
}
