import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExceptionsCard, FunnelCard } from "@/components/Health";
import { Card } from "@/components/ui/card";
import { useFactory } from "@/store/context";
import {
  DASHBOARD_GAPS,
  DASH_MODES,
  MODE_SECTIONS,
  compareOf,
  emptiness,
  forecast,
  kpis,
  modeForRole,
  type DashMode,
} from "@/store/command";
import type { PermModule } from "@/store/permissions";
import { cairoToday } from "@/lib/utils";
import {
  CommandHeader,
  KpiCard,
  Section,
  Skeleton,
  rangeFromState,
  type DashState,
} from "@/components/command/Kit";
import { DecisionsCard, ForecastCard, RisksAndOpportunities } from "@/components/command/Decisions";
import {
  AgingCard,
  BreakEvenCard,
  CashCenter,
  CostMix,
  CustomerSection,
  FinancialPerformance,
  MarginTrend,
  ModelSection,
  MonthlyPerformance,
  ProfitWaterfall,
} from "@/components/command/Finance";
import {
  BottleneckCard,
  DeliveryCard,
  LineComparison,
  LiveOrders,
  OrderMixCard,
  ProductionOverview,
} from "@/components/command/Production";
import {
  DeadStockCard,
  InventoryCenter,
  LowStockCard,
  QualitySection,
  SupplierCard,
  TurnoverCard,
  WorkforceSection,
} from "@/components/command/Operations";
import {
  ActivityCard,
  CalendarCard,
  EmptyFactory,
  FactoryHealthCard,
  QuickActions,
  TargetsCard,
  YtdCard,
} from "@/components/command/Overview";

/**
 * غرفة تحكم المصنع.
 *
 * الشاشة دي مبنية على تلات قواعد:
 *
 * ١. **الترتيب من الخريطة مش من الملف.** `MODE_SECTIONS` في المخزن هو
 *    اللي بيقول أي قسم فوق أي قسم في كل وضع. الملف ده بيرسم بس.
 * ٢. **الصلاحية بتشيل القسم بالكامل.** المشرف مايشوفش المالية — مش
 *    بنخفي الأرقام ونسيب العنوان، بنشيل القسم من الترتيب من الأساس.
 * ٣. **العرض على موجات.** الحساب كله بيتم وقت العرض، وبعض الأقسام
 *    (القرارات، الأوامر، الموردين) غالية. فبنطلّع الأساسي الأول
 *    والباقي بعده بموجات، وبين ده وده هيكل مش شاشة فاضية.
 */

type SectionDef = {
  /** الصلاحية اللي بتفتح القسم — null معناه متاح لأي حد داخل */
  perm: PermModule | null;
  /** الموجة: ٠ فوري، ١ بعده، ٢ آخر حاجة */
  wave: 0 | 1 | 2;
  render: (ctx: Ctx) => ReactNode;
};

type Ctx = {
  range: ReturnType<typeof rangeFromState>;
  cmp: ReturnType<typeof compareOf>;
  mode: DashMode;
};

/** موجات العرض: كل موجة بتتركّب بعد اللي قبلها تخلص رسم */
function useWaves(count: number): number {
  const [ready, setReady] = useState(0);
  useEffect(() => {
    if (ready >= count) return;
    const t = setTimeout(() => setReady((r) => r + 1), 60);
    return () => clearTimeout(t);
  }, [ready, count]);
  return ready;
}

export function CommandPage() {
  const { db, session, can } = useFactory();
  const [state, setState] = useState<DashState>(() => ({
    rangeKey: "month",
    custom: { from: cairoToday().slice(0, 8) + "01", to: cairoToday() },
    compare: "prev",
    mode: modeForRole(session?.role ?? "supervisor", can.do("finance", "view")),
  }));

  const range = useMemo(() => rangeFromState(state), [state]);
  const cmp = useMemo(() => compareOf(range, state.compare), [range, state.compare]);
  const ctx: Ctx = { range, cmp, mode: state.mode };

  const modes = DASH_MODES.filter((m) => (m === "exec" ? can.do("finance", "view") : true));
  const mode = modes.includes(state.mode) ? state.mode : modes[modes.length - 1];

  const order = MODE_SECTIONS[mode].filter((key) => {
    const def = SECTIONS[key];
    return def && (def.perm === null || can.do(def.perm, "view"));
  });

  const waves = useWaves(3);
  const empty = emptiness(db);

  return (
    <div className="space-y-5">
      <CommandHeader state={{ ...state, mode }} onChange={setState} modes={modes} />

      {empty.isEmpty ? (
        <EmptyFactory />
      ) : (
        <>
          {order.map((key) => {
            const def = SECTIONS[key];
            if (def.wave > waves) {
              return (
                <Card key={key} aria-busy="true">
                  <Skeleton lines={3} />
                </Card>
              );
            }
            return <div key={key}>{def.render(ctx)}</div>;
          })}

          <GapsCard />
        </>
      )}
    </div>
  );
}

/* ── سجل الأقسام ───────────────────────────────────────────────── */

const SECTIONS: Record<string, SectionDef> = {
  health: {
    perm: null,
    wave: 0,
    render: () => <FactoryHealthCard />,
  },

  decisions: {
    perm: null,
    wave: 1,
    render: ({ range, cmp }) => (
      <div className="space-y-3">
        <ExceptionsCard limit={5} />
        <DecisionsCard range={range} cmp={cmp} />
      </div>
    ),
  },

  kpis: {
    perm: null,
    wave: 0,
    render: ({ range, cmp }) => <KpiGrid range={range} cmp={cmp} />,
  },

  finance: {
    perm: "finance",
    wave: 1,
    render: ({ range }) => (
      <Section title="الأداء المالي" hint="الإيراد والمصروف والربح على نفس المحور" to="/treasury" toLabel="افتح الخزينة">
        <FinancialPerformance range={range} />
      </Section>
    ),
  },

  margin: {
    perm: "costing",
    wave: 2,
    render: ({ range }) => (
      <Section title="الربحية وتركيب التكلفة" to="/costing" toLabel="افتح لوحة التكلفة">
        <div className="grid gap-3 lg:grid-cols-2">
          <MarginTrend range={range} />
          <CostMix range={range} />
        </div>
      </Section>
    ),
  },

  waterfall: {
    perm: "costing",
    wave: 2,
    render: ({ range }) => (
      <div className="grid gap-3 lg:grid-cols-2">
        <ProfitWaterfall range={range} />
        <BreakEvenCard range={range} />
      </div>
    ),
  },

  cash: {
    perm: "finance",
    wave: 1,
    render: ({ range }) => (
      <Section title="السيولة" to="/treasury">
        <CashCenter range={range} />
      </Section>
    ),
  },

  aging: {
    perm: "finance",
    wave: 2,
    render: () => (
      <div className="grid gap-3 lg:grid-cols-2">
        <AgingCard />
        <YtdCard />
      </div>
    ),
  },

  production: {
    perm: "production",
    wave: 0,
    render: ({ range }) => (
      <Section title="الإنتاج" to="/orders">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <ProductionOverview range={range} />
            <FunnelCard />
          </div>
          <div className="space-y-3">
            <BottleneckCard />
            <DeliveryCard range={range} />
          </div>
        </div>
      </Section>
    ),
  },

  pipeline: {
    perm: "production",
    wave: 2,
    render: ({ range }) => (
      <div className="grid gap-3 lg:grid-cols-2">
        <OrderMixCard />
        <LineComparison range={range} />
      </div>
    ),
  },

  live: {
    perm: "production",
    wave: 1,
    render: () => <LiveOrders />,
  },

  quality: {
    perm: "quality",
    wave: 2,
    render: ({ range }) => <QualitySection range={range} />,
  },

  inventory: {
    perm: "inventory",
    wave: 1,
    render: ({ range }) => (
      <Section title="المخزون" to="/materials">
        <div className="space-y-3">
          <InventoryCenter />
          <div className="grid gap-3 lg:grid-cols-3">
            <LowStockCard />
            <DeadStockCard />
            <TurnoverCard range={range} />
          </div>
        </div>
      </Section>
    ),
  },

  suppliers: {
    perm: "purchasing",
    wave: 2,
    render: () => (
      <Section title="الموردين" to="/costs" toLabel="افتح المشتريات">
        <SupplierCard />
      </Section>
    ),
  },

  workforce: {
    perm: "workers",
    wave: 1,
    render: ({ range }) => <WorkforceSection range={range} />,
  },

  customers: {
    perm: "parties",
    wave: 2,
    render: ({ range }) => <CustomerSection range={range} />,
  },

  models: {
    perm: "costing",
    wave: 2,
    render: () => <ModelSection />,
  },

  forecast: {
    perm: "reports",
    wave: 2,
    render: ({ range, cmp }) => (
      <Section title="اللي جاي" hint="مؤكد من أوامر مفتوحة + اتجاه من التوريدات الفعلية">
        <div className="grid gap-3 lg:grid-cols-2">
          <ForecastCardWrapper />
          <div className="space-y-3">
            <RisksAndOpportunities range={range} cmp={cmp} />
          </div>
        </div>
      </Section>
    ),
  },

  targets: {
    perm: "reports",
    wave: 2,
    render: ({ range }) => (
      <div className="grid gap-3 lg:grid-cols-2">
        <TargetsCard range={range} />
        <MonthlyPerformance range={range} />
      </div>
    ),
  },

  quick: {
    perm: null,
    wave: 1,
    render: () => <QuickActions />,
  },

  timeline: {
    perm: null,
    wave: 2,
    render: () => (
      <div className="grid gap-3 lg:grid-cols-2">
        <CalendarCard />
        <ActivityCard />
      </div>
    ),
  },
};

function ForecastCardWrapper() {
  const { db } = useFactory();
  return <ForecastCard forecastData={forecast(db, 30)} />;
}

/* ── شبكة المؤشرات ─────────────────────────────────────────────── */

function KpiGrid({ range, cmp }: { range: Ctx["range"]; cmp: Ctx["cmp"] }) {
  const { db, can } = useFactory();
  const rows = kpis(db, range, cmp);

  /** المؤشر بيتشال لو الدور مايشوفش الموديول بتاعه — مش بنخفي الرقم بس */
  const GATE: Record<string, PermModule> = {
    revenue: "finance",
    profit: "finance",
    margin: "costing",
    cost: "finance",
    cash: "finance",
    overdue: "finance",
    stock: "inventory",
    production: "production",
    efficiency: "planning",
    quality: "production",
    orders: "production",
    workforce: "workers",
  };

  const shown = rows.filter((k) => {
    const gate = GATE[k.key];
    return !gate || can.do(gate, "view");
  });

  if (!shown.length) return null;

  return (
    <Section title="المؤشرات" hint={`${range.label}${cmp ? ` · مقارنة بـ${cmp.label}` : ""}`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {shown.map((k) => (
          <KpiCard key={k.key} kpi={k} />
        ))}
      </div>
    </Section>
  );
}

/* ── اللي لسه محتاج بيانات ─────────────────────────────────────── */

function GapsCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-2 text-right"
      >
        <span className="text-base">حاجات اللوحة مش بتقولها — وليه</span>
        <span className="shrink-0 text-sm text-muted-foreground">{open ? "اخفي" : "اعرض"}</span>
      </button>

      {open ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            دي حاجات مطلوبة في اللوحة والبيانات مابتسمحش بيها لسه. بنسمّيها بدل ما نعرض أرقام ملفّقة
            تبان حقيقية:
          </p>
          <ul className="mt-2 list-none space-y-1.5">
            {DASHBOARD_GAPS.map((g) => (
              <li key={g.label} className="text-sm">
                <span>{g.label}</span>
                <span className="block text-xs text-muted-foreground">محتاج: {g.needs}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
