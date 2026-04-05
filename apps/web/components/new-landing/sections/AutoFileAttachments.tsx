import { FileDown, FolderOpen } from "lucide-react";
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
    folder: "Invoices / 2026",
    color: "text-red-500",
    folderColor: "text-amber-600",
  },
  {
    file: "Signed-NDA.pdf",
    folder: "Legal / Contracts",
    color: "text-blue-500",
    folderColor: "text-blue-600",
  },
  {
    file: "Q1-Report.pdf",
    folder: "Finance / Reports",
    color: "text-green-600",
    folderColor: "text-green-700",
  },
];

export function AutoFileAttachments() {
  return (
    <Section>
      <SectionHeading>Email attachments, filed automatically</SectionHeading>
      <SectionSubtitle>
        Incoming PDFs, receipts, and contracts get saved to the right Google
        Drive or OneDrive folder. No dragging, no sorting, no effort.
      </SectionSubtitle>
      <SectionContent className="flex justify-center">
        <BlurFade inView>
          <CardWrapper className="mx-auto max-w-md">
            <div className="flex flex-col gap-3 p-2">
              {filedItems.map((item) => (
                <div
                  key={item.file}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                >
                  <FileDown className={`size-5 shrink-0 ${item.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {item.file}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <FolderOpen
                      className={`size-4 ${item.folderColor}`}
                      strokeWidth={1.5}
                    />
                    <span className="text-xs text-gray-400">{item.folder}</span>
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
