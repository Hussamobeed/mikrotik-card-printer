import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { reportsApi, routersApi } from "@/services/api";
import { UserManagerReport } from "@/types";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  WifiOff,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

export function ReportsPage() {
  const [routerId, setRouterId] = useState("");
  const [report, setReport] = useState<UserManagerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ step: "", retry: 0, message: "" });
  const abortRef = useRef<AbortController | null>(null);

  const [filters, setFilters] = useState({
    profile: "",
    price: "",
    fromDate: "",
    toDate: "",
    port: "",
    nasId: "",
  });
  const [searchTerm, setSearchTerm] = useState("");

  const { data: routers = [] } = useQuery({
    queryKey: ["routers"],
    queryFn: routersApi.list,
  });

  // Step 1: Sync from MikroTik to DB (SLOW - may timeout for 2000+ users on free tier)
  async function syncFromRouter() {
    if (!routerId) return;
    setLoading(true);
    setProgress({ step: "اتصال", retry: 0, message: "جاري الاتصال بالراوتر وجلب البيانات..." });
    setReport(null);

    try {
      const result = await reportsApi.sync(routerId);
      setProgress({ step: "تم", retry: 0, message: `تم جلب ${result.usersCount} مستخدم من الراوتر` });
      // After sync, fetch from DB (instant)
      await fetchFromCache();
    } catch (err: any) {
      const isTimeout = err.message?.includes("timeout") || err.status === 504 || err.status === 502;
      if (isTimeout) {
        setProgress({ step: "فشل", retry: 0, message: "انتهت المهلة — الراوتر يحتوي على مستخدمين كثيرين" });
        alert("انتهت مهلة الاتصال (30 ثانية).\n\nالراوتر يحتوي على عدد كبير من المستخدمين ويتجاوز حد الخطة المجانية.\n\nالحلول:\n1. استخدم راوتر أصغر للتجربة\n2. قم بترقية خطة Supabase\n3. أو استخدم "قراءة من القاعدة" إذا سبق وأن نجحت المزامنة");
      } else {
        setProgress({ step: "فشل", retry: 0, message: err.message || "فشل المزامنة" });
        alert(err.message || "فشل المزامنة — تأكد من تشغيل الراوتر");
      }
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Fetch from DB cache (INSTANT - no timeout)
  async function fetchFromCache() {
    if (!routerId) return;
    setLoading(true);
    setProgress({ step: "قراءة", retry: 0, message: "جاري قراءة البيانات من القاعدة..." });
    try {
      const data = await reportsApi.fetch(routerId);
      setReport(data);
      setProgress({ step: "تم", retry: 0, message: `تم عرض ${data.items.length} مستخدم` });
    } catch (err: any) {
      alert(err.message || "فشل قراءة البيانات");
    } finally {
      setLoading(false);
    }
  }

  const [sortKey, setSortKey] = useState<keyof UserManagerReport["items"][0] | "price">("username");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredItems = useMemo(() => {
    if (!report) return [];
    let items = [...report.items];
    if (filters.profile) items = items.filter((i) => i.profile === filters.profile);
    if (filters.price) {
      const p = parseFloat(filters.price);
      if (!isNaN(p)) items = items.filter((i) => i.price === p);
    }
    if (filters.fromDate) items = items.filter((i) => i.firstName.includes(filters.fromDate));
    if (filters.toDate) items = items.filter((i) => i.firstName.includes(filters.toDate));
    if (filters.port) items = items.filter((i) => i.nasPort.includes(filters.port));
    if (filters.nasId) {
      const q = filters.nasId.toLowerCase();
      items = items.filter((i) => i.nasPortId.toLowerCase().includes(q) || i.calledStationId.toLowerCase().includes(q));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter((i) => i.username.toLowerCase().includes(q) || i.profile.toLowerCase().includes(q) || i.customer.toLowerCase().includes(q) || i.comment.toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return items;
  }, [report, filters, searchTerm, sortKey, sortDir]);

  const summary = useMemo(() => {
    if (!report) return null;
    const totalRevenue = filteredItems.reduce((s, i) => s + i.price, 0);
    const profileBreakdown: Record<string, { count: number; revenue: number }> = {};
    for (const i of filteredItems) {
      if (!profileBreakdown[i.profile]) profileBreakdown[i.profile] = { count: 0, revenue: 0 };
      profileBreakdown[i.profile].count++;
      profileBreakdown[i.profile].revenue += i.price;
    }
    return {
      totalCount: report.items.length,
      filteredCount: filteredItems.length,
      totalRevenue,
      profileBreakdown,
      profileCount: Object.keys(profileBreakdown).length,
    };
  }, [report, filteredItems]);

  function exportCSV() {
    if (!report) return;
    const headers = ["Username","Customer","Profile","Price","First-Name","Comment","NAS-Port","NAS-Port-ID","Called-Station","Last-Seen","Bytes-In","Bytes-Out","Uptime"];
    const rows = filteredItems.map((i) => [i.username,i.customer,i.profile,i.price,i.firstName,i.comment,i.nasPort,i.nasPortId,i.calledStationId,i.lastSeen,i.bytesIn,i.bytesOut,i.uptime]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '\"')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${report.routerName}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const profileOptions = useMemo(() => {
    if (!report) return [];
    return Array.from(new Set(report.items.map((i) => i.profile).filter(Boolean))).sort();
  }, [report]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          تقارير User Manager
        </h1>
      </div>

      {/* Router selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            اختر الراوتر
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap items-end">
            <div className="w-full sm:w-64">
              <Label className="text-xs">الراوتر</Label>
              <Select value={routerId} onChange={(e) => { setRouterId(e.target.value); setReport(null); }}>
                <option value="">-- اختر راوتر --</option>
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </div>
            <Button onClick={syncFromRouter} disabled={!routerId || loading} variant="default">
              {loading && progress.step === "اتصال" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {loading && progress.step === "اتصال" ? "جاري المزامنة..." : "مزامنة من الراوتر"}
            </Button>
            <Button onClick={fetchFromCache} disabled={!routerId || loading} variant="outline">
              {loading && progress.step === "قراءة" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              قراءة من القاعدة
            </Button>
          </div>
          {report && (
            <p className="text-xs text-emerald-600">
              ✓ تم جلب {report.items.length} مستخدم من "{report.routerName}"
            </p>
          )}
          {!report && !loading && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">ملاحظة مهمة:</p>
                  <p>المزامنة من الراوتر قد تستغرق وقتًا حسب عدد المستخدمين. إذا كان لديك أكثر من 2000 مستخدم، قد تنتهي المهلة (timeout) بسبب قيود الخطة المجانية. في هذه الحالة، جرّب مزامنة راوتر أصغر أو قم بالترقية.</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress / Loading Modal */}
      {loading && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <div>
              <p className="font-semibold text-lg">{progress.message}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {progress.step === "اتصال" ? (
                  <span>قد يستغرق هذا 5-10 دقائق حسب عدد المستخدمين — لا تغلق الصفحة</span>
                ) : progress.step === "قراءة" ? (
                  <span>جاري قراءة البيانات المخزنة...</span>
                ) : (
                  <span>تم!</span>
                )}
              </p>
            </div>
            {/* Animated progress bar */}
            <div className="w-full max-w-md mx-auto h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse rounded-full" style={{ width: progress.step === "اتصال" ? "20%" : progress.step === "إعادة محاولة" ? "50%" : "80%" }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters — HIDDEN until loaded */}
      {report && !loading && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" />
                فلترة البيانات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <div>
                  <Label className="text-xs">البروفايل</Label>
                  <Select value={filters.profile} onChange={(e) => setFilters((f) => ({ ...f, profile: e.target.value }))}>
                    <option value="">الكل</option>
                    {profileOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">السعر</Label>
                  <Input type="number" placeholder="مثال: 180" value={filters.price} onChange={(e) => setFilters((f) => ({ ...f, price: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">من تاريخ</Label>
                  <Input placeholder="2026-05-01" value={filters.fromDate} onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">إلى تاريخ</Label>
                  <Input placeholder="2026-05-31" value={filters.toDate} onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">NAS Port</Label>
                  <Input placeholder="2151700060" value={filters.port} onChange={(e) => setFilters((f) => ({ ...f, port: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">NAS ID / Called Station</Label>
                  <Input placeholder="00:00:00:00:00:00" value={filters.nasId} onChange={(e) => setFilters((f) => ({ ...f, nasId: e.target.value }))} />
                </div>
              </div>
            </CardContent>
          </Card>

          {summary && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardContent className="flex flex-col gap-2 p-5"><Users className="h-5 w-5 text-primary" /><p className="text-2xl font-bold">{summary.totalCount}</p><p className="text-xs text-muted-foreground">إجمالي المستخدمين</p></CardContent></Card>
              <Card><CardContent className="flex flex-col gap-2 p-5"><Filter className="h-5 w-5 text-orange-500" /><p className="text-2xl font-bold">{summary.filteredCount}</p><p className="text-xs text-muted-foreground">نتائج الفلتر</p></CardContent></Card>
              <Card><CardContent className="flex flex-col gap-2 p-5"><TrendingUp className="h-5 w-5 text-emerald-500" /><p className="text-2xl font-bold">{summary.totalRevenue.toLocaleString()}</p><p className="text-xs text-muted-foreground">إيرادات الفلتر</p></CardContent></Card>
              <Card><CardContent className="flex flex-col gap-2 p-5"><BarChart3 className="h-5 w-5 text-blue-500" /><p className="text-2xl font-bold">{summary.profileCount}</p><p className="text-xs text-muted-foreground">بروفايلات</p></CardContent></Card>
            </div>
          )}

          {summary && Object.keys(summary.profileBreakdown).length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">الإحصائيات حسب البروفايل</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(summary.profileBreakdown).map(([profile, stats]) => (
                    <div key={profile} className="rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="font-semibold text-sm">{profile}</p>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>{stats.count} مستخدم</span><span className="text-emerald-600 font-medium">{stats.revenue.toLocaleString()}</span></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-sm flex items-center gap-2"><Search className="h-4 w-4" />بيانات المستخدمين</CardTitle>
              <div className="flex gap-2">
                <Input placeholder="بحث..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-40 sm:w-56" />
                <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" />تصدير CSV</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40 text-right">
                      {[
                        { key: "username", label: "المستخدم" },
                        { key: "profile", label: "البروفايل" },
                        { key: "price", label: "السعر" },
                        { key: "firstName", label: "تاريخ الإنشاء" },
                        { key: "comment", label: "ملاحظة" },
                        { key: "nasPort", label: "Port" },
                        { key: "nasPortId", label: "NAS ID" },
                        { key: "calledStationId", label: "Called Station" },
                        { key: "lastSeen", label: "آخر ظهور" },
                        { key: "bytesIn", label: "Bytes In" },
                        { key: "bytesOut", label: "Bytes Out" },
                        { key: "uptime", label: "Uptime" },
                      ].map((col) => (
                        <th key={col.key} className="px-3 py-2 cursor-pointer hover:bg-secondary transition-colors whitespace-nowrap" onClick={() => { if (sortKey === col.key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); } else { setSortKey(col.key as any); setSortDir("asc"); } }}>
                          <div className="flex items-center gap-1 justify-end">{col.label}{sortKey === col.key && <span className="text-primary">{sortDir === "asc" ? "▲" : "▼"}</span>}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-2 font-medium">{item.username}</td>
                        <td className="px-3 py-2">{item.profile}</td>
                        <td className="px-3 py-2 text-emerald-600 font-medium">{item.price}</td>
                        <td className="px-3 py-2 text-xs">{item.firstName}</td>
                        <td className="px-3 py-2 text-xs">{item.comment}</td>
                        <td className="px-3 py-2 text-xs font-mono">{item.nasPort}</td>
                        <td className="px-3 py-2 text-xs font-mono">{item.nasPortId}</td>
                        <td className="px-3 py-2 text-xs font-mono">{item.calledStationId}</td>
                        <td className="px-3 py-2 text-xs">{item.lastSeen}</td>
                        <td className="px-3 py-2 text-xs font-mono">{item.bytesIn}</td>
                        <td className="px-3 py-2 text-xs font-mono">{item.bytesOut}</td>
                        <td className="px-3 py-2 text-xs">{item.uptime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredItems.length === 0 && <p className="text-center text-muted-foreground py-8">لا توجد نتائج مطابقة</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
