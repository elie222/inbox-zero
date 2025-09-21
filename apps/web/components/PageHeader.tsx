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
      <div className="flex items-center mt-1">
        <PageSubHeading>{description}</PageSubHeading>
        {video && <WatchVideo video={video} />}
      </div>
    </div>
  );
}

function WatchVideo({ video }: { video: Video }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" className="ml-3">
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
