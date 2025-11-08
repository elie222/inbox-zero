import { OnboardingDialogContent } from "@/components/OnboardingModal";
import { PageHeading, PageSubHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { PlayIcon } from "lucide-react";

type Video = {
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
};

export function PageHeader({
  title,
  description,
  video,
}: {
  title: string;
  description: string;
  video?: Video;
}) {
  return (
    <div>
      <PageHeading>{title}</PageHeading>
      <div className="flex flex-col sm:flex-row items-start sm:items-center mt-1 gap-3">
        <PageSubHeading className="hidden sm:block">
          {description}
        </PageSubHeading>
        {video && (video.youtubeVideoId || video.muxPlaybackId) && (
          <WatchVideo video={video} />
        )}
      </div>
    </div>
  );
}

function WatchVideo({ video }: { video: Video }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs">
          <PlayIcon className="mr-2 size-3" />
          Watch demo
        </Button>
      </DialogTrigger>
      <OnboardingDialogContent
        title={video.title}
        description={video.description}
        youtubeVideoId={video.youtubeVideoId}
        muxPlaybackId={video.muxPlaybackId}
      />
    </Dialog>
  );
}
