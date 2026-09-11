import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Boxes, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DataRow } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { cairoToday, formatDate, qty } from "@/lib/utils";
import { modelsUsingMaterial } from "@/store/costing";
import { useFactory } from "@/store/context";
import { ExportMenu } from "@/components/export/ExportMenu";
import { datasetOf } from "@/store/datasets";
import { DocumentButton } from "@/components/docs/DocumentPrint";
import {
  dailyUsage,
  itemMovements,
  materialStock,
  stockQty,
  suggestedPurchase,
  unitName,
  type MaterialStock,
} from "@/store/manufacturing";
import { STOCK_KIND_LABEL, type StockKind } from "@/store/types";
import { useSeen } from "@/store/recents";

const STATE: Record<MaterialStock["state"], { label: string; tone: Tone }> = {
  out: { label: "خلصت", tone: "danger" },
  low: { label: "قرّبت تخلص", tone: "warn" },
  ok: { label: "متاحة", tone: "ok" },
};

export function MaterialsPage() {
  const { db, can } = useFactory();
  const [open, setOpen] = useState(false);
  const rows = materialStock(db);
  const alerts = rows.filter((r) => r.state !== "ok");
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">المخزن</h2>
          <p className="text-sm text-muted-foreground">
            الرصيد محسوب من حركات المخزن — تقدر تدوس على أي خامة وتشوف الحركات اللي كوّنته.
          </p>
        </div>
        <div className="flex gap-2">
          <DocumentButton type="stock" refId={db.factory?.id ?? ""} label="كشف جرد" />
          <ExportMenu module="inventory" dataset={() => datasetOf(db, "materials")} />
          {can.edit ? <Button onClick={() => setOpen(true)}>خامة جديدة</Button> : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="المخزن فاضي"
          body="سجّل خاماتك وكمياتها، وبعدها كل صرف لأمر إنتاج هيخصم من هنا لوحده."
          action={can.edit ? { label: "أضف خامة", onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <p className="text-sm text-muted-foreground">قيمة المخزون</p>
              <p className="mt-1 text-2xl">
                <Money value={totalValue} />
              </p>
            </Card>
            <Card>
              <p className="text-sm text-muted-foreground">خامات محتاجة شراء</p>
              <p className="mt-1 text-2xl tabular">{alerts.length}</p>
            </Card>
          </div>

          {alerts.length ? (
            <Card className="border-warn/30 bg-warn-soft/40">
              <h3 className="text-base">محتاج تشتري</h3>
              <ul className="mt-2 list-none space-y-2">
                {alerts.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      {r.name} —{" "}
                      {r.state === "out"
                        ? "خلصت من المخزن"
                        : r.daysOfCover !== null
                          ? `هتكفي ${Math.floor(r.daysOfCover)} يوم بس`
                          : `الرصيد تحت حد الطلب`}
                    </span>
                    <span className="shrink-0 tabular text-muted-foreground">
                      اشترِ {qty(suggestedPurchase(r), 0)} {unitName(db, r.unitId)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {rows.map((r) => (
              <Link
                key={r.id}
                to={`/materials/${r.id}`}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-secondary/40"
              >
                <div className="min-w-0">
                  <p className="truncate">{r.name}</p>
                  <p className="text-sm text-muted-foreground tabular">
                    {qty(r.qty)} {unitName(db, r.unitId)} · متوسط التكلفة {Math.round(r.avgCost)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <MaterialForm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function MaterialForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addMaterial } = useFactory();
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState(db.units[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [leadTime, setLeadTime] = useState("7");
  const cats = db.categories.filter((c) => c.kind === "material");

  return (
    <Panel
      open={open}
      title="خامة جديدة"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              try {
                addMaterial({
                  name,
                  sku: `M-${String(db.materials.length + 1).padStart(3, "0")}`,
                  categoryId: categoryId || null,
                  unitId: unitId || null,
                  avgCost: Number(avgCost) || 0,
                  reorderPoint: Number(reorderPoint) || 0,
                  leadTimeDays: Number(leadTime) || 0,
                  defaultVendor: "",
                });
                toast.success("الخامة اتسجلت.");
                setName("");
                setAvgCost("");
                setReorderPoint("");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "مش قادر أسجل الخامة.");
              }
            }}
          >
            حفظ الخامة
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <Field label="اسم الخامة">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="الوحدة">
        <select className={selectClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          {db.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="الفئة">
        <select className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">بدون فئة</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="تكلفة الوحدة">
        <Input inputMode="decimal" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} />
      </Field>
      <Field label="حد إعادة الطلب">
        <Input inputMode="decimal" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
      </Field>
      <Field label="مدة التوريد (يوم)">
        <Input inputMode="numeric" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
      </Field>
    </Panel>
  );
}

export function MaterialDetailPage() {
  const { id = "" } = useParams();
  const { db, can, addStockMovement, updateMaterial } = useFactory();
  const material = db.materials.find((m) => m.id === id);
  useSeen(db.factory?.id ?? "", material ? { kind: "material", id: material.id, label: material.name, to: `/materials/${material.id}` } : null);
  const [kind, setKind] = useState<StockKind>("purchase");
  const [amount, setAmount] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");

  if (!material) return <p className="text-sm text-muted-foreground">الخامة مش موجودة.</p>;

  const unit = unitName(db, material.unitId);
  const moves = itemMovements(db, "material", material.id);
  const qtyNow = stockQty(db, "material", material.id);
  const perDay = dailyUsage(db, material.id);
  const cover = perDay > 0 ? qtyNow / perDay : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl">{material.name}</h2>
        <p className="text-sm text-muted-foreground">
          <span className="latin">{material.sku}</span> · الوحدة {unit}
        </p>
      </div>

      <Card>
        <dl className="divide-y divide-border/60">
          <DataRow label="الرصيد الحالي">
            <span className="tabular font-medium">
              {qty(qtyNow)} {unit}
            </span>
          </DataRow>
          <DataRow label="قيمة الرصيد">
            <Money value={qtyNow * material.avgCost} />
          </DataRow>
          <DataRow label="متوسط الاستهلاك">
            <span className="tabular">
              {qty(perDay)} {unit} / يوم
            </span>
          </DataRow>
          <DataRow label="تكفي كام يوم">
            <span className="tabular">{cover === null ? "مفيش استهلاك مسجّل" : `${Math.floor(cover)} يوم`}</span>
          </DataRow>
          <DataRow label="حد إعادة الطلب">
            {can.edit ? (
              <input
                type="number"
                value={material.reorderPoint}
                onChange={(e) => updateMaterial(material.id, { reorderPoint: Number(e.target.value) || 0 })}
                className="h-9 w-28 rounded-md border border-input bg-background px-2 text-left text-sm tabular"
                aria-label="حد إعادة الطلب"
              />
            ) : (
              <span className="tabular">{material.reorderPoint}</span>
            )}
          </DataRow>
          <DataRow label="مدة التوريد">
            <span className="tabular">{material.leadTimeDays} يوم</span>
          </DataRow>
        </dl>
      </Card>

      {can.edit ? (
        <Card>
          <h3 className="text-base">سجّل حركة مخزن</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as StockKind)}>
              <option value="purchase">{STOCK_KIND_LABEL.purchase}</option>
              <option value="opening">{STOCK_KIND_LABEL.opening}</option>
              <option value="return">{STOCK_KIND_LABEL.return}</option>
              <option value="waste">{STOCK_KIND_LABEL.waste}</option>
              <option value="adjust">{STOCK_KIND_LABEL.adjust}</option>
            </select>
            <Input inputMode="decimal" placeholder={`الكمية بالـ${unit}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input
              inputMode="decimal"
              placeholder="تكلفة الوحدة"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
            <Input placeholder="ملاحظة" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            التسوية بتقبل رقم سالب لو الجرد أقل من الدفاتر. الصرف لأوامر الإنتاج بيتسجل من صفحة الأمر.
          </p>
          <Button
            className="mt-3"
            onClick={() => {
              try {
                const cost = Number(unitCost) || material.avgCost;
                addStockMovement({
                  date: cairoToday(),
                  itemType: "material",
                  itemId: material.id,
                  warehouseId: db.warehouses.find((w) => w.kind === "material")?.id ?? null,
                  kind,
                  qty: Number(amount) || 0,
                  unitCost: cost,
                  refType: "",
                  refId: null,
                  notes,
                });
                if (kind === "purchase" && Number(unitCost) > 0) {
                  updateMaterial(material.id, { avgCost: Number(unitCost) });
                }
                setAmount("");
                setNotes("");
                toast.success("الحركة اتسجلت والرصيد اتحدّث.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "مش قادر أسجل الحركة.");
              }
            }}
          >
            سجّل الحركة
          </Button>
        </Card>
      ) : null}

      <AffectedModels materialId={material.id} />

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-base">حركات المخزن</h3>
          <ExportMenu
            module="inventory"
            dataset={() =>
              datasetOf(db, "movements", {
                ids: new Set(moves.map((m) => m.id)),
                filters: [{ label: "الخامة", value: material.name }],
              })
            }
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {moves.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">مفيش حركات لسه.</p>
          ) : (
            moves.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p>{STOCK_KIND_LABEL[m.kind]}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(m.date)}
                    {m.notes ? ` · ${m.notes}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`tabular font-medium ${m.qty > 0 ? "text-ok" : "text-danger"}`}>
                    {m.qty > 0 ? "+" : ""}
                    {qty(m.qty)} {unit}
                  </span>
                  {/* إذن الاستلام بيطلع من حركة الشراء أو الرصيد الافتتاحي بس */}
                  {m.kind === "purchase" || m.kind === "opening" ? (
                    <DocumentButton type="grn" refId={m.id} label="إذن استلام" variant="ghost" />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/** الموديلات اللي تكلفتها بتتغير لما سعر الخامة دي يتغير */
function AffectedModels({ materialId }: { materialId: string }) {
  const { db, can } = useFactory();
  if (!can.finance) return null;
  const rows = modelsUsingMaterial(db, materialId);
  if (!rows.length) return null;

  return (
    <Card>
      <h3 className="text-base">الموديلات المتأثرة بسعر الخامة</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        أي تغيير في سعر الوحدة بيعيد حساب تكلفة الموديلات دي وهوامشها في نفس اللحظة — مفيش إعادة إدخال.
      </p>
      <ul className="mt-2 list-none space-y-2">
        {rows.map((r) => (
          <li key={r.product.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <Link to={`/products/${r.product.id}`} className="font-medium underline-offset-4 hover:underline">
                {r.product.name}
              </Link>
              <span className="tabular text-muted-foreground">
                {qty(r.effectiveQty)} {r.unit} للقطعة · <Money value={r.lineCost} /> ·{" "}
                {qty(Math.round(r.sharePct), 0)}٪ من التكلفة
                {r.marginPct === null ? "" : ` · هامش ${qty(Math.round(r.marginPct), 0)}٪`}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r.sharePct)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
