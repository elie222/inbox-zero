import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ProfileImage({
  image,
  label = "",
  size = 24,
  className,
}: {
  image: string | null;
  label: string;
  size?: number;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      <AvatarImage src={image || undefined} width={size} height={size} />
      <AvatarFallback>{label.at(0)?.toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
