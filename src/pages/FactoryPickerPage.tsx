import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Factory as FactoryIcon, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { ROLE_EXPLAIN, workspaceUrl } from "@/store/account";
import { useFactory } from "@/store/context";
import { INDUSTRY_LABEL, ROLE_LABEL, type Industry } from "@/store/types";

/** المستخدم الواحد ممكن يملك أكتر من مصنع، وكل مصنع بياناته مستقلة */
export function FactoryPickerPage() {
  const { account, enterWorkspace, signOut } = useFactory();
  const nav = useNavigate();
  const rows = account.mine;

  return (
    <AuthShell
      wide
      title="اختار المصنع"
      subtitle={`أهلًا ${account.user?.fullName ?? ""} — عندك ${rows.length === 1 ? "مصنع واحد" : `${rows.length} مصانع`} على حسابك. كل مصنع بياناته وصلاحياته لوحده.`}
      footer={
        <button onClick={signOut} className="inline-flex items-center gap-1.5 hover:text-foreground">
          <LogOut className="h-4 w-4" />
          خروج من الحساب
        </button>
      }
    >
      <div className="space-y-2">
        {rows.map((w) => {
          const role = w.ownerId === account.user?.id ? "owner" : (w.access.find((a) => a.userId === account.user?.id)?.role ?? "supervisor");
          return (
            <button
              key={w.factoryId}
              onClick={() => {
                try {
                  enterWorkspace(w.factoryId);
                  nav("/");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "مش قادر يفتح المصنع.");
                }
              }}
              className="flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-right transition-colors hover:border-accent"
            >
              {w.logo ? (
                <img src={w.logo} alt="" className="h-12 w-12 shrink-0 rounded-md border border-border object-contain" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <FactoryIcon className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{w.name}</span>
                <span className="latin block truncate text-xs text-muted-foreground">{workspaceUrl(w.subdomain)}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{INDUSTRY_LABEL[w.industry as Industry] ?? w.industry}</span>
                  <span className="text-accent">{ROLE_LABEL[role]}</span>
                  <span>{w.lastAccessAt ? `آخر دخول ${formatDate(w.lastAccessAt.slice(0, 10))}` : "لسه مفتحتوش"}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{ROLE_EXPLAIN[role]}</span>
              </span>
              <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}

        {!rows.length ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm">مفيش مصنع على حسابك لسه</p>
            <p className="mt-1 text-xs text-muted-foreground">جهّز مصنعك الأول في أقل من دقيقة.</p>
          </div>
        ) : null}

        <Button variant="outline" className="w-full" asChild>
          <Link to="/factories/new">
            <Plus className="h-4 w-4" />
            مصنع جديد
          </Link>
        </Button>
      </div>
    </AuthShell>
  );
}
