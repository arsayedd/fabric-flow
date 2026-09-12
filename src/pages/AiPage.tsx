import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Brain, Lock, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { Field } from "@/components/Panel";
import { qty } from "@/lib/utils";
import { useFactory } from "@/store/context";
import { ask, askCatalog, asOf, suggestions, type AskResult } from "@/store/ask";
import { exceptions } from "@/store/health";
import { MODULE_LABEL as PERM_LABEL, type PermModule } from "@/store/permissions";
import { DEFAULT_RULES, RULE_DEFS, RULE_KEYS, changedRules, rulesOf, type AlertRules } from "@/store/rules";

/**
 * مساعد صنعة.
 *
 * الشاشة دي بتعمل حاجتين، والاتنين مالهمش علاقة بـ«ذكاء اصطناعي»
 * بالمعنى الدارج:
 *
 * ١. **اسأل صنعة** — بتاخد سؤال بالعامية وبتردّ برقم **محسوب من دفتر
 *    المصنع**، ومعاه «الرقم جه منين» ولينك للسجل. والسؤال اللي النظام
 *    مش فاهمه بيتقال له مش فاهم — عمره ما بيتخمّن، لأن اللي بيقرا الرقم
 *    بياخد بيه قرار.
 *
 * ٢. **قواعد التنبيه** — الأرقام اللي بتحدّد إمتى حاجة تبقى «خطر».
 *    كانت مكتوبة جوه الكود، وهي في الحقيقة قرار مصنع.
 *
 * واللي **مش** موجود هنا مقصود: مفيش قواعد بتعمل حركة لوحدها (تبعت
 * واتساب، تقفل أمر، تطلب من مورّد). الأتمتة اللي بتتحرّك لوحدها في
 * نظام فلوس محتاجة سجل موافقات وصلاحيات وتراجع — ولسه مابنيناهاش،
 * فمابندّعيهاش.
 */

const TABS = [
  { id: "ask", label: "اسأل صنعة" },
  { id: "rules", label: "قواعد التنبيه" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AiPage({ initialTab = "ask" }: { initialTab?: TabId }) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => {
    const want = params.get("tab");
    return TABS.some((t) => t.id === want) ? (want as TabId) : initialTab;
  });

  const pickTab = (id: TabId) => {
    setTab(id);
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">مساعد صنعة</h2>
        <p className="text-sm text-muted-foreground">
          اسأل بالعامية، والجواب بيتحسب من دفتر مصنعك — مش من نص متولّد. وقواعد التنبيه بتحدّد إمتى صنعة تقول
          «خطر».
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => pickTab(t.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              tab === t.id ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ask" ? <AskTab /> : <RulesTab />}
    </div>
  );
}

/* ── اسأل صنعة ─────────────────────────────────────────────────── */

function AskTab() {
  const { db, can } = useFactory();
  const allowed = (perm: PermModule) => can.do(perm, "view");
  const [text, setText] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);

  const mine = suggestions(allowed);
  const hidden = askCatalog().length - mine.length;

  const run = (q: string) => {
    setText(q);
    setResult(ask(db, q, allowed));
  };

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run(text)}
            placeholder="مين عليه فلوس متأخرة؟"
            className="min-w-0 flex-1"
          />
          <Button onClick={() => run(text)}>
            <Search /> اسأل
          </Button>
        </div>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          الإجابة بتتحسب لحظتها من حركات مصنعك بتاريخ {asOf()} — نفس الأرقام اللي في الشاشات بالحرف. وصنعة
          مابتجاوبش على حاجة مش مسجّلة عندك: لو البيانات ناقصة، بتقول محتاجة إيه.
        </p>
      </Card>

      {result ? <Answer result={result} onAsk={run} /> : null}

      <Card>
        <p className="text-sm">الأسئلة اللي صنعة تعرف تجاوبها</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          كل سؤال مربوط بحساب موجود في النظام. مفيش سؤال جوابه تقدير.
          {hidden > 0
            ? ` و${qty(hidden, 0)} سؤال متخفي عنك لأن صلاحيتك مابتفتحش شاشاتهم.`
            : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mine.map((s) => (
            <button
              key={s.key}
              onClick={() => run(s.question)}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {s.question}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Answer({ result, onAsk }: { result: AskResult; onAsk: (q: string) => void }) {
  if (result.kind === "denied") {
    return (
      <Card className="border-r-2 border-r-warn">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 text-warn" />
          <div>
            <p className="text-sm">السؤال ده جوابه في «{PERM_LABEL[result.perm]}»، وصلاحيتك مابتفتحهاش.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              فهمنا السؤال ({result.question}) بس مش بنعرضه. الصلاحية بتتقفل على مستوى البيانات نفسها، مش على
              مستوى الشاشة — فمفيش طريق تاني للرقم ده. اطلبها من صاحب المصنع.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (result.kind === "unknown") {
    return (
      <Card className="border-r-2 border-r-border">
        <p className="text-sm">مش فاهم السؤال ده.</p>
        <p className="mt-0.5 text-xs leading-6 text-muted-foreground">
          وصنعة مابتخمّنش: الجواب المخترع في نظام فلوس أخطر من «مش عارف». جرّب واحد من دول، أو اكتب سؤالك
          بكلمات أقرب لأسماء الشاشات.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {result.suggestions.slice(0, 8).map((s) => (
            <button
              key={s.key}
              onClick={() => onAsk(s.question)}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {s.question}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  const a = result.answer;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{a.question}</p>
          <p className="mt-0.5 text-lg">{a.headline}</p>
        </div>
        <Badge tone="muted">{PERM_LABEL[a.perm]}</Badge>
      </div>

      {a.missing ? (
        <p className="mt-2 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          مش محسوب لسه — محتاج: {a.missing}. لما البيانات دي تتسجّل، السؤال ده بيرد لوحده.
        </p>
      ) : null}

      {a.rows.length ? (
        <ul className="mt-2 list-none divide-y divide-border">
          {a.rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                {r.to ? (
                  <Link to={r.to} className="min-w-0 truncate text-sm underline-offset-4 hover:underline">
                    {r.label}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate text-sm">{r.label}</span>
                )}
                <span className="shrink-0 text-sm tabular text-muted-foreground">{r.value}</span>
              </div>
              {r.sub ? <p className="text-xs text-muted-foreground">{r.sub}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 border-t border-border pt-2 text-xs leading-6 text-muted-foreground">
        الرقم ده جه منين: {a.basis}
      </p>

      {a.to ? (
        <div className="mt-2">
          <Link to={a.to} className="flex items-center gap-0.5 text-sm text-accent underline-offset-4 hover:underline">
            افتح الشاشة وشوف السجلات
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

/* ── قواعد التنبيه ─────────────────────────────────────────────── */

function RulesTab() {
  const { db, can, setRules } = useFactory();
  const current = rulesOf(db);
  const [draft, setDraft] = useState<Record<keyof AlertRules, string>>(() => {
    const out = {} as Record<keyof AlertRules, string>;
    for (const k of RULE_KEYS) out[k] = String(current[k]);
    return out;
  });
  const mayEdit = can.do("settings", "edit");
  const changed = changedRules(db);
  const live = exceptions(db);

  const save = () => {
    const next = {} as AlertRules;
    for (const k of RULE_KEYS) next[k] = Number(draft[k]);
    try {
      setRules(next);
      toast.success("القواعد اتحدّثت — التنبيهات بتتحسب بيها من دلوقتي.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const reset = () => {
    const out = {} as Record<keyof AlertRules, string>;
    for (const k of RULE_KEYS) out[k] = String(DEFAULT_RULES[k]);
    setDraft(out);
  };

  if (!mayEdit) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="القواعد بتتعدّل بصلاحية الإعدادات"
        body="حساسية التنبيهات بتغيّر اللي كل الفريق بيشوفه كخطر، فتعديلها مقصور على صاحب المصنع. تقدر تشوف القيم الحالية في التنبيهات نفسها."
        action={{ label: "شوف التنبيهات", onClick: () => window.location.assign("/alerts") }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm">إمتى صنعة تقول «خطر»</p>
        <p className="mt-0.5 text-xs leading-6 text-muted-foreground">
          الأرقام دي حساسية التنبيهات الموجودة، مش تنبيهات جديدة: مصنع بيستورد من الصين محتاج يتنبّه على
          الخامة بدري، ومصنع بيشتري من السوق كل يوم مش محتاج. والافتراضي هو نفس سلوك النظام من أول يوم، فلو
          مالمستهمش مش هيتغيّر حاجة.
        </p>
        {changed.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {qty(changed.length, 0)} قاعدة مختلفة عن الافتراضي:{" "}
            {changed.map((c) => `${RULE_DEFS[c.key].label} (${qty(c.from, 0)} ← ${qty(c.to, 0)})`).join(" · ")}
          </p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        {RULE_KEYS.map((k) => {
          const def = RULE_DEFS[k];
          return (
            <div key={k} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <Field label={`${def.label} (${def.unit})`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="w-28"
                    value={draft[k]}
                    min={def.min}
                    max={def.max}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  />
                  <span className="text-xs text-muted-foreground">
                    الافتراضي {qty(DEFAULT_RULES[k], 0)} {def.unit} · المدى {qty(def.min, 0)}–{qty(def.max, 0)}
                  </span>
                  <Link to={def.to} className="text-xs text-accent underline-offset-4 hover:underline">
                    شوف الشاشة
                  </Link>
                </div>
              </Field>
              <p className="-mt-2 text-xs leading-6 text-muted-foreground">{def.effect}</p>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button variant="gold" onClick={save}>
            احفظ القواعد
          </Button>
          <Button variant="outline" onClick={reset}>
            <RotateCcw /> رجّع الافتراضي
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">بالقواعد الحالية، صنعة شايفة {qty(live.length, 0)} استثناء</p>
          <Link to="/alerts" className="text-sm text-accent underline-offset-4 hover:underline">
            افتح القايمة كلها
          </Link>
        </div>
        {live.length ? (
          <ul className="mt-2 list-none divide-y divide-border">
            {live.slice(0, 5).map((x) => (
              <li key={x.key} className="flex items-baseline justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                <span className="min-w-0 truncate text-sm">{x.title}</span>
                <Badge tone={x.tone === "danger" ? "danger" : x.tone === "warn" ? "warn" : "muted"}>
                  {x.tone === "danger" ? "أحمر" : x.tone === "warn" ? "أصفر" : "للعلم"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-ok">مفيش استثناء دلوقتي — مش لأن القواعد واسعة، لأن الأرقام سليمة.</p>
        )}
      </Card>

      <Card>
        <div className="flex items-start gap-2">
          <Brain className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <p className="text-xs leading-6 text-muted-foreground">
            اللي مش موجود هنا عن قصد: قواعد بتعمل حركة لوحدها — تبعت واتساب، تقفل أمر، تطلب من مورّد. أي حركة
            بتمسّ فلوس أو مخزون محتاجة موافقة وسجل وإمكانية رجوع، وده لسه مابنيناهوش. فالقواعد دي بتظبّط
            التنبيه، والقرار يفضل بإيدك.
          </p>
        </div>
      </Card>
    </div>
  );
}
