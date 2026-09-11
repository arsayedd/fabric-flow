import { useState, type ReactNode } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import {
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  FileText,
  Link2,
  Mail,
  MessageCircle,
  Printer,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  copyDataset,
  datasetText,
  downloadCsv,
  downloadXlsx,
  mailtoLink,
  shareDataset,
  whatsappLink,
  type ExportDataset,
} from "@/lib/export";
import { useFactory } from "@/store/context";
import type { PermModule } from "@/store/permissions";
import { TablePrint } from "./TablePrint";

/**
 * مركز التصدير.
 *
 * القاعدة في صنعة: **مفيش قائمة بلا تصدير.** والزر ده هو تنفيذ القاعدة،
 * فبيتحط جنب أي جدول أو قائمة، وبياخد وصف البيانات (`ExportDataset`)
 * مش الجدول نفسه — فالتصدير بيطلع **نفس الأعمدة اللي المستخدم شايفها
 * وبنفس الفلاتر**، مش كل أعمدة الداتابيز.
 *
 * والوصف بيتبني بـ`() => dataset` مش قيمة: الحساب بيحصل وقت الضغط بس،
 * فجدول فيه آلاف الصفوف مايتحسبش من تاني في كل رسمة للشاشة.
 *
 * والصلاحية: التصدير فعل ليه خانة في مصفوفة الصلاحيات (`export`). اللي
 * مامعاهوش الخانة دي في الموديول ده **مايشوفش الزر ولا ينفّذ** — لأن
 * تصدير جدول العملاء بره المصنع هو نفسه تسريب بيانات.
 */

type Props = {
  dataset: () => ExportDataset;
  module: PermModule;
  /** زر مختصر: أيقونة بس بلا كلمة، للجداول جوه الكروت */
  compact?: boolean;
  /** عناصر إضافية في القائمة — زي «طبع كمستند» بتنسيقه الرسمي */
  extra?: ReactNode;
  className?: string;
};

export function ExportMenu({ dataset, module, compact, extra, className }: Props) {
  const { db, session, can } = useFactory();
  const [printing, setPrinting] = useState<ExportDataset | null>(null);

  if (!can.do(module, "export")) return null;

  const meta = { factory: db.factory?.name ?? "مصنع", user: session?.name ?? "—" };

  const run = (fn: () => void | Promise<void>, done?: string) => {
    void (async () => {
      try {
        await fn();
        if (done) toast.success(done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "التصدير مانفعش.");
      }
    })();
  };

  return (
    <>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button variant="outline" size="sm" className={cn("gap-1.5", className)} aria-label="تصدير وطباعة">
            <Download aria-hidden />
            {compact ? null : "تصدير"}
          </Button>
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-56 rounded-lg border border-border bg-card p-1 shadow-lg"
          >
            <Row
              icon={<FileSpreadsheet aria-hidden />}
              label="ملف Excel"
              hint="أعمدة وفلاتر ومجاميع بصيغ حقيقية"
              onSelect={() => run(() => downloadXlsx(dataset(), meta), "نزّلنا ملف Excel.")}
            />
            <Row
              icon={<FileText aria-hidden />}
              label="ملف CSV"
              hint="للرفع على أنظمة تانية"
              onSelect={() => run(() => downloadCsv(dataset()), "نزّلنا ملف CSV.")}
            />
            <Row
              icon={<Printer aria-hidden />}
              label="طباعة ومعاينة"
              hint="بترويسة المصنع والمجاميع"
              onSelect={() => setPrinting(dataset())}
            />

            <Menu.Separator className="my-1 h-px bg-border" />

            <Row
              icon={<ClipboardCopy aria-hidden />}
              label="نسخ الجدول"
              hint="الزقه في Excel أو Sheets"
              onSelect={() => run(() => copyDataset(dataset()), "نسخنا الجدول.")}
            />
            <Row
              icon={<Share2 aria-hidden />}
              label="مشاركة ملف"
              onSelect={() =>
                run(async () => {
                  const how = await shareDataset(dataset(), meta);
                  toast.success(how === "shared" ? "بعتنا الملف." : "المتصفح مابيشاركش ملفات، فنزّلناه.");
                })
              }
            />
            <Row
              icon={<MessageCircle aria-hidden />}
              label="واتساب"
              hint="ملخص نصي، الملف بيتبعت بإيدك"
              onSelect={() => window.open(whatsappLink(datasetText(dataset())), "_blank", "noopener")}
            />
            <Row
              icon={<Mail aria-hidden />}
              label="بريد"
              onSelect={() => {
                const ds = dataset();
                window.location.href = mailtoLink(ds.title, datasetText(ds));
              }}
            />
            <Row
              icon={<Link2 aria-hidden />}
              label="نسخ رابط الشاشة"
              hint="بالفلاتر الحالية"
              onSelect={() =>
                run(() => navigator.clipboard.writeText(window.location.href), "نسخنا الرابط بالفلاتر.")
              }
            />

            {extra ? (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                {extra}
              </>
            ) : null}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      {printing ? <TablePrint dataset={printing} onClose={() => setPrinting(null)} /> : null}
    </>
  );
}

function Row({
  icon,
  label,
  hint,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-muted"
    >
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </Menu.Item>
  );
}

/** بند جاهز للقائمة — الشاشات بتستخدمه في `extra` */
export function ExportMenuItem({
  icon,
  label,
  hint,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return <Row icon={icon} label={label} hint={hint} onSelect={onSelect} />;
}
