import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CostingSection } from "@/components/Costing";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { Field, Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DataRow } from "@/components/ui/card";
import { Input, selectClass } from "@/components/ui/input";
import { qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { activeBom, bomLines, productCost, routingLines, unitName } from "@/store/manufacturing";

export function ProductsPage() {
  const { db, can } = useFactory();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">المنتجات</h2>
          <p className="text-sm text-muted-foreground">
            كل منتج بخاماته وعملياته — والتكلفة بتتحسب لوحدها، مش بتتكتب بالإيد.
          </p>
        </div>
        {can.edit ? <Button onClick={() => setOpen(true)}>منتج جديد</Button> : null}
      </div>

      {db.products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="لسه مفيش منتجات"
          body="سجّل أول منتج، وبعدها حدّد خاماته وعملياته عشان النظام يعرف تكلفة القطعة وربحها."
          action={can.edit ? { label: "أضف منتج", onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {db.products.map((p) => {
            const c = productCost(db, p.id);
            const missing = !c.hasBom || !c.hasRouting;
            return (
              <Card key={p.id}>
                <div className="flex items-center justify-between gap-3 border-b pb-3">
                  <Link to={`/products/${p.id}`} className="text-base hover:text-accent">
                    {p.name}
                  </Link>
                  {missing ? (
                    <Badge tone="warn">ناقص بيانات</Badge>
                  ) : (
                    <Badge tone={c.margin >= 20 ? "ok" : c.margin > 0 ? "gold" : "danger"}>
                      هامش {Math.round(c.margin)}٪
                    </Badge>
                  )}
                </div>
                <dl className="mt-1 divide-y divide-border/60">
                  <DataRow label="تكلفة الخامات">
                    <Money value={c.materials} />
                  </DataRow>
                  <DataRow label="أجور العمليات">
                    <Money value={c.labor} />
                  </DataRow>
                  <DataRow label="تكلفة القطعة">
                    <Money value={c.total} />
                  </DataRow>
                  <DataRow label="سعر البيع">
                    <Money value={c.sellPrice} />
                  </DataRow>
                  <DataRow label="ربح القطعة">
                    <Money value={c.profit} signed />
                  </DataRow>
                </dl>
                {missing ? (
                  <p className="mt-3 text-xs text-warn">
                    {!c.hasBom ? "محتاج قائمة خامات. " : ""}
                    {!c.hasRouting ? "محتاج مسار عمليات." : ""}
                  </p>
                ) : null}
                <Link
                  to={`/products/${p.id}`}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
                >
                  الخامات والعمليات
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      <ProductForm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function ProductForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, addProduct } = useFactory();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitId, setUnitId] = useState(db.units[0]?.id ?? "");
  const [sellPrice, setSellPrice] = useState("");
  const cats = db.categories.filter((c) => c.kind === "product");

  return (
    <Panel
      open={open}
      title="منتج جديد"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              try {
                addProduct({
                  name,
                  sku: sku.trim() || `P-${String(db.products.length + 1).padStart(3, "0")}`,
                  categoryId: categoryId || null,
                  unitId: unitId || null,
                  sellPrice: Number(sellPrice) || 0,
                  minStock: 0,
                });
                toast.success("المنتج اتسجل. حدّد خاماته وعملياته دلوقتي.");
                setName("");
                setSku("");
                setSellPrice("");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "مش قادر أسجل المنتج.");
              }
            }}
          >
            حفظ المنتج
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <Field label="اسم المنتج">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: قميص قطني" />
      </Field>
      <Field label="الكود (اختياري)">
        <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="P-001" />
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
      <Field label="وحدة البيع">
        <select className={selectClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          {db.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="سعر البيع">
        <Input inputMode="numeric" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
      </Field>
    </Panel>
  );
}

export function ProductDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { db, can, addBomItem, removeBomItem, addRoutingStep, removeRoutingStep, updateProduct, deleteProduct } =
    useFactory();
  const product = db.products.find((p) => p.id === id);
  const [materialId, setMaterialId] = useState("");
  const [amount, setAmount] = useState("");
  const [waste, setWaste] = useState("0");
  const [operationId, setOperationId] = useState("");
  const [rate, setRate] = useState("");

  if (!product) return <p className="text-sm text-muted-foreground">المنتج مش موجود.</p>;

  const bom = activeBom(db, product.id);
  const lines = bomLines(db, bom?.id);
  const routes = routingLines(db, product.id);
  const c = productCost(db, product.id);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">{product.name}</h2>
          <p className="text-sm text-muted-foreground">
            <span className="latin">{product.sku}</span> · الوحدة {unitName(db, product.unitId)}
          </p>
        </div>
        {can.delete ? (
          <Button
            variant="dangerGhost"
            size="sm"
            onClick={() => {
              try {
                deleteProduct(product.id);
                navigate("/products");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "مش قادر أمسح.");
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            مسح
          </Button>
        ) : null}
      </div>

      <Card>
        <h3 className="text-base">تكلفة القطعة</h3>
        <dl className="mt-2 divide-y divide-border/60">
          <DataRow label="خامات (بعد الهالك)">
            <Money value={c.materials} />
          </DataRow>
          <DataRow label="أجور العمليات">
            <Money value={c.labor} />
          </DataRow>
          <DataRow label="أوفرهيد">
            <Money value={c.overhead} />
          </DataRow>
          <DataRow label="الإجمالي">
            <Money value={c.total} />
          </DataRow>
          <DataRow label="سعر البيع">
            {can.finance ? (
              <input
                type="number"
                value={product.sellPrice}
                onChange={(e) => updateProduct(product.id, { sellPrice: Number(e.target.value) || 0 })}
                className="h-9 w-28 rounded-md border border-input bg-background px-2 text-left text-sm tabular"
                aria-label="سعر البيع"
              />
            ) : (
              <Money value={product.sellPrice} />
            )}
          </DataRow>
          <DataRow label="ربح القطعة">
            <Money value={c.profit} signed />
          </DataRow>
          <DataRow label="زمن التصنيع">
            <span className="tabular">{qty(c.minutes, 0)} دقيقة</span>
          </DataRow>
        </dl>
        {c.profit < 0 ? (
          <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            سعر البيع أقل من التكلفة. كل قطعة بتخسر <Money value={Math.abs(c.profit)} />.
          </p>
        ) : null}
      </Card>

      <section>
        <h3 className="mb-2 text-base">قائمة الخامات</h3>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {lines.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              مفيش خامات متسجّلة. ضيف الخامة والكمية المستهلكة في القطعة الواحدة.
            </p>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="truncate">{l.name}</p>
                  <p className="text-sm text-muted-foreground tabular">
                    {qty(l.qtyPerUnit)} {l.unit} + هالك {qty(l.wastePct, 0)}٪ = {qty(l.effectiveQty)} {l.unit}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Money value={l.lineCost} />
                  {can.edit ? (
                    <Button variant="dangerGhost" size="icon" aria-label="حذف" onClick={() => removeBomItem(l.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {can.edit ? (
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_7rem_7rem_auto]">
            <select className={selectClass} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">اختَر خامة</option>
              {db.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Input inputMode="decimal" placeholder="الكمية" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input inputMode="decimal" placeholder="هالك ٪" value={waste} onChange={(e) => setWaste(e.target.value)} />
            <Button
              onClick={() => {
                try {
                  addBomItem(product.id, {
                    materialId,
                    qtyPerUnit: Number(amount) || 0,
                    wastePct: Number(waste) || 0,
                  });
                  setMaterialId("");
                  setAmount("");
                  setWaste("0");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "مش قادر أضيف الخامة.");
                }
              }}
            >
              أضف
            </Button>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="mb-2 text-base">مسار العمليات</h3>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {routes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              مفيش عمليات. رتّب خطوات التصنيع وسعر القطعة في كل خطوة.
            </p>
          ) : (
            routes.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm tabular">
                    {r.seq}
                  </span>
                  <div>
                    <p>
                      {r.name}
                      {r.isOutsourced ? <Badge tone="muted" className="mr-2">تشغيل خارجي</Badge> : null}
                    </p>
                    <p className="text-sm text-muted-foreground tabular">{qty(r.stdMinutes)} دقيقة للقطعة</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Money value={r.rate} />
                  {can.edit ? (
                    <Button variant="dangerGhost" size="icon" aria-label="حذف" onClick={() => removeRoutingStep(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {can.edit ? (
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_7rem_auto]">
            <select
              className={selectClass}
              aria-label="اختَر عملية"
              value={operationId}
              onChange={(e) => {
                setOperationId(e.target.value);
                const op = db.operations.find((o) => o.id === e.target.value);
                if (op) setRate(String(op.defaultRate));
              }}
            >
              <option value="">اختَر عملية</option>
              {db.operations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <Input inputMode="decimal" placeholder="سعر القطعة" value={rate} onChange={(e) => setRate(e.target.value)} />
            <Button
              onClick={() => {
                try {
                  const op = db.operations.find((o) => o.id === operationId);
                  addRoutingStep(product.id, operationId, Number(rate) || 0, op?.defaultMinutes ?? 0);
                  setOperationId("");
                  setRate("");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "مش قادر أضيف العملية.");
                }
              }}
            >
              أضف
            </Button>
          </div>
        ) : null}
      </section>

      {can.finance ? <CostingSection productId={product.id} /> : null}
    </div>
  );
}
