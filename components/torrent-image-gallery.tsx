"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

type TorrentImageGalleryProps = {
  images: Array<{
    id: number;
    url: string;
  }>;
};

export function TorrentImageGallery({ images }: TorrentImageGalleryProps) {
  const [index, setIndex] = useState(-1);
  const slides = useMemo(() => images.map((img) => ({ src: img.url })), [images]);

  return (
    <>
      <div className="detail-image-grid">
        {images.map((img, idx) => (
          <button
            className="detail-image-item detail-image-button"
            key={img.id}
            onClick={() => setIndex(idx)}
            type="button"
          >
            <Image alt="torrent image" fill src={img.url} unoptimized />
          </button>
        ))}
      </div>

      <Lightbox
        carousel={{ finite: images.length <= 1 }}
        close={() => setIndex(-1)}
        index={index < 0 ? 0 : index}
        open={index >= 0}
        plugins={[Zoom]}
        slides={slides}
        zoom={{
          maxZoomPixelRatio: 4,
          wheelZoomDistanceFactor: 120,
        }}
      />
    </>
  );
}
