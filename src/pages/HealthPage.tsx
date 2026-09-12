/**
 * صحة النظام.
 *
 * الشاشة دي مش للمستخدم اللي بيشغّل المصنع — هي للي مسؤول عن الدفتر نفسه.
 * سؤالها الوحيد: **الأرقام اللي باقي الشاشات بتقراها سليمة؟** فبتعرض حجم
 * الدفتر، وفحوص السلامة بأمثلة بالاسم، والأقسام المبنية، وسجلات المستندات
 * والتصدير — من غير أي رقم مزوّق: اللي مش متحقّق مابيتعرضش «تمام».
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExportMenu } from "@/components/export/ExportMenu";
import { qty } from "@/lib/utils";
import { MODULE_KEYS, MODULE_LABEL, MODULE_READY, effectiveModules } from "@/store/account";
import { useFactory } from "@/store/context";
import { DATASETS, datasetOf } from "@/store/datasets";
import { DOC_DEFS } from "@/store/documents";
import { integritySummary, tableCounts } from "@/store/integrity";
import { LABEL_TYPES } from "@/store/labels";

const TABLE_LABEL: Record<string, string> = {
  parties: "جهات التعامل",
  orders: "أوامر الإنتاج",
  deliveries: "التوريدات",
  collections: "التحصيلات",
  costEntries: "فواتير المصروف",
  costPayments: "مدفوعات المصروف",
  stockMovements: "حركات المخزون",
  materials: "الخامات",
  products: "المنتجات",
  bundles: "الباندلات",
  bundleOps: "تسجيلات العمليات",
  stageEntries: "مراحل الإنتاج",
  returns: "المرتجعات",
  repairs: "أوامر الإصلاح",
  machines: "الماكينات",
  workers: "العمال",
  workerEarnings: "أجور العمال",
  supplyOrders: "أوامر التوريد",
  supplyReceipts: "إذون الاستلام",
  scans: "المسح",
  auditLog: "سجل التغييرات",
};

export function HealthPage() {
  const { db, can, account } = useFactory();
  const { checks, failed, problems } = integritySummary(db);
  const counts = tableCounts(db);
  const rows = counts.reduce((s, c) => s + c.rows, 0);
  const chosen = effectiveModules(account.workspace);
  const built = MODULE_KEYS.filter((k) => MODULE_READY[k]);
  const size = new Blob([JSON.stringify(db)]).size;

  if (!can.do("settings", "view")) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          الشاشة دي لصاحب المصنع ومدير النظام — صلاحية «الإعدادات» مطلوبة.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">صحة النظام</h2>
          <p className="text-sm text-muted-foreground">
            حجم الدفتر وسلامة الروابط والأقسام المبنية. الفحوص بتتحسب من الدفتر وقت ما تفتح الشاشة.
          </p>
        </div>
        {can.do("settings", "export") ? (
          <ExportMenu
            module="settings"
            dataset={() => datasetOf(db, "integrity")}
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">سجلات الدفتر</p>
          <p className="mt-1 text-2xl tabular">{qty(rows, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">في {qty(counts.length, 0)} جدول</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">فحوص فيها مشكلة</p>
          <p className="mt-1 text-2xl tabular">{qty(failed, 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            من {qty(checks.length, 0)} فحص · {problems ? `${qty(problems, 0)} سجل` : "مفيش سجل مكسور"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">أقسام مبنية</p>
          <p className="mt-1 text-2xl tabular">
            {qty(built.length, 0)} / {qty(MODULE_KEYS.length, 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">مختار في مصنعك {qty(chosen.length, 0)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">حجم الدفتر على الجهاز</p>
          <p className="mt-1 text-2xl tabular">{qty(Math.round(size / 1024), 0)} ك.ب</p>
          <p className="mt-1 text-xs text-muted-foreground">الدفتر كله محلي لحد ما ينتقل للسيرفر</p>
        </Card>
      </div>

      <section>
        <h3 className="mb-2 text-base">فحوص السلامة</h3>
        <div className="space-y-2">
          {checks.map((c) => (
            <Card key={c.key} className={c.count ? "" : "opacity-70"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p>{c.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.about}</p>
                </div>
                <Badge tone={c.count === 0 ? "ok" : c.tone === "warn" ? "warn" : "danger"}>
                  {c.count === 0 ? "سليم" : `${qty(c.count, 0)} سجل`}
                </Badge>
              </div>
              {c.samples.length ? (
                <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                  {c.samples.map((s) => (
                    <li key={s} className="latin-mixed">
                      {s}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-base">الأقسام</h3>
        <Card className="p-0">
          {MODULE_KEYS.map((k) => (
            <div
              key={k}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0"
            >
              <span>{MODULE_LABEL[k]}</span>
              <span className="flex items-center gap-2">
                {chosen.includes(k) ? <Badge tone="gold">مختار</Badge> : null}
                <Badge tone={MODULE_READY[k] ? "ok" : "muted"}>{MODULE_READY[k] ? "مبني" : "مش مبني"}</Badge>
              </span>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <h3 className="mb-2 text-base">السجلات والقوائم</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-muted-foreground">قوائم قابلة للتصدير</p>
            <p className="mt-1 text-2xl tabular">{qty(DATASETS.length, 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Link to="/exports" className="text-accent">
                مركز التصدير
              </Link>
            </p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">أنواع المستندات</p>
            <p className="mt-1 text-2xl tabular">{qty(Object.keys(DOC_DEFS).length, 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Link to="/documents" className="text-accent">
                مركز المستندات
              </Link>
            </p>
          </Card>
          <Card>
            <p className="text-sm text-muted-foreground">أنواع الليبلات</p>
            <p className="mt-1 text-2xl tabular">{qty(LABEL_TYPES.length, 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Link to="/labels" className="text-accent">
                مركز الطباعة
              </Link>
            </p>
          </Card>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-base">الجداول</h3>
        <Card className="p-0">
          {counts.map((c) => (
            <div
              key={c.table}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 text-sm last:border-0"
            >
              <span>{TABLE_LABEL[c.table] ?? <span className="latin">{c.table}</span>}</span>
              <span className="tabular text-muted-foreground">{qty(c.rows, 0)}</span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
