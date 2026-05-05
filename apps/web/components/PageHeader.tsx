import { PageHeaderVideoButton } from "@/components/PageHeaderVideoButton";
import { PageHeading, PageSubHeading } from "@/components/Typography";

type Video = {
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
};

interface PageHeaderProps {
  description?: string;
  title: string;
  video?: Video;
}

export function PageHeader({ title, video, description }: PageHeaderProps) {
  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center mt-1 gap-3">
        <div>
          <PageHeading>{title}</PageHeading>
          {description && (
            <PageSubHeading className="mt-1">{description}</PageSubHeading>
          )}
        </div>
        {video && (video.youtubeVideoId || video.muxPlaybackId) && (
          <PageHeaderVideoButton video={video} />
        )}
      </div>
    </div>
  );
}
