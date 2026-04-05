import { ChevronRight, FileDown, FolderOpen } from "lucide-react";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { CardWrapper } from "@/components/new-landing/common/CardWrapper";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import {
  SectionHeading,
  SectionSubtitle,
} from "@/components/new-landing/common/Typography";

const filedItems = [
  {
    file: "Invoice-March.pdf",
    folder: "Invoices / March",
    fileBorderColor: "from-new-purple-200 to-new-purple-300",
    fileGradient: "from-new-purple-50 to-new-purple-100",
    fileIconColor: "text-new-purple-600",
  },
  {
    file: "Signed-NDA.pdf",
    folder: "Contracts",
    fileBorderColor: "from-new-blue-150 to-new-blue-200",
    fileGradient: "from-new-blue-50 to-new-blue-100",
    fileIconColor: "text-new-blue-600",
  },
  {
    file: "Q1-Report.pdf",
    folder: "Reports",
    fileBorderColor: "from-new-green-150 to-new-green-200",
    fileGradient: "from-new-green-50 to-new-green-100",
    fileIconColor: "text-new-green-600",
  },
];

const folderTileStyles = {
  borderColor: "from-new-gray-150 to-new-gray-200",
  gradient: "from-white to-new-gray-100",
  iconColor: "text-new-gray-500",
} as const;

export function AutoFileAttachments() {
  return (
    <Section>
      <SectionHeading>Email attachments, filed automatically</SectionHeading>
      <SectionSubtitle>
        Incoming PDFs, receipts, and contracts get saved to the right Google
        Drive or OneDrive folder. See where each file lands and reply to move
        it.
      </SectionSubtitle>
      <SectionContent className="flex justify-center">
        <BlurFade inView>
          <CardWrapper className="mx-auto w-full max-w-2xl">
            <div className="flex flex-col gap-3 p-2">
              {filedItems.map((item) => (
                <div
                  key={item.file}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-4 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm sm:gap-x-6"
                >
                  <GradientIconTile
                    borderColor={item.fileBorderColor}
                    gradient={item.fileGradient}
                  >
                    <FileDown
                      className={`h-4 w-4 ${item.fileIconColor}`}
                      strokeWidth={1.75}
                    />
                  </GradientIconTile>
                  <p className="truncate text-sm font-medium text-gray-800">
                    {item.file}
                  </p>
                  <ChevronRight
                    className="h-4 w-4 text-gray-300"
                    strokeWidth={1.75}
                  />
                  <div className="grid w-40 shrink-0 grid-cols-[auto_1fr] items-center gap-2 justify-self-end text-left">
                    <GradientIconTile
                      borderColor={folderTileStyles.borderColor}
                      gradient={folderTileStyles.gradient}
                      size="sm"
                    >
                      <FolderOpen
                        className={`h-3.5 w-3.5 ${folderTileStyles.iconColor}`}
                        strokeWidth={1.75}
                      />
                    </GradientIconTile>
                    <span className="whitespace-nowrap text-xs text-gray-400">
                      {item.folder}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardWrapper>
        </BlurFade>
      </SectionContent>
    </Section>
  );
}

function GradientIconTile({
  children,
  borderColor,
  gradient,
  size = "md",
}: {
  children: React.ReactNode;
  borderColor: string;
  gradient: string;
  size?: "md" | "sm";
}) {
  const tileSize =
    size === "sm" ? "h-7 w-7 rounded-[6px]" : "h-9 w-9 rounded-[7px]";

  return (
    <div
      className={`rounded-lg bg-gradient-to-b p-px shadow-sm ${borderColor}`}
    >
      <div
        className={`flex items-center justify-center bg-gradient-to-b shadow-sm ${tileSize} ${gradient}`}
      >
        {children}
      </div>
    </div>
  );
}
