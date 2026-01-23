"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ScreenshotGalleryProps {
  screenshots: string[];
  pluginName: string;
}

export function ScreenshotGallery({
  screenshots,
  pluginName,
}: ScreenshotGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!screenshots || screenshots.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Screenshots</h3>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {screenshots.map((src, index) => (
          <button
            key={index}
            onClick={() => setSelectedImage(src)}
            className="flex-shrink-0 rounded-lg border border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
            type="button"
          >
            <Image
              src={src}
              alt={`${pluginName} screenshot ${index + 1}`}
              width={200}
              height={150}
              className="object-cover"
            />
          </button>
        ))}
      </div>

      <Dialog
        open={!!selectedImage}
        onOpenChange={() => setSelectedImage(null)}
      >
        <DialogContent className="max-w-4xl">
          {selectedImage && (
            <Image
              src={selectedImage}
              alt="Screenshot preview"
              width={800}
              height={600}
              className="w-full h-auto"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
