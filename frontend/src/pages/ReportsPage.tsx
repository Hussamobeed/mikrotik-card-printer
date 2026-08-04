import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reportsApi, routersApi } from "@/services/api";
import { useAppStore } from "@/stores/appStore";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

// The columns we specifically care about filtering on, per the request:
// profile, price, port (nas-port-id), and NAS identifier. RouterOS field
// names vary a bit by version, so we check a couple of likely candidates
// for each and fall back gracefully if a router doesn't provide one.
const FILTERABLE_COLUMNS: { key: string; label: string; candidates: string[] }[] = [
  { key: "profile", label: "البروفايل", candidates: ["profile"] },
  { key: "price", label: "السعر", candidates: ["price"] },
  { key: "port", label: "البورت (NAS Port)", candidates: ["nas-port-id", "nas-port", "port"] },
  { key: "nasId", label: "معرّف NAS", candidates: ["nas-identifier", "nas-ip-address", "nasid"] },
];

function resolveField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
  }
  return "";
}

export function ReportsPage() {
  const { selectedRouterId } = useAppStore();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const { data: routers = [] } = useQuery({ queryKey: ["routers"], queryFn: routersApi.list });

  const reportMutation = useMutation({
    mutationFn: () => reportsApi.fetch(selectedRouterId as string),
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = reportMutation.data?.rows ?? [];

  // All columns that actually appear across the fetched rows, so the table
  // works regardless of exactly which fields this router's RouterOS version
  // returns — nothing is hardcoded/assumed beyond the filter helpers above.
  const allColumns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    const priority = ["user", "username", "profile", "price"];
    return [
      ...priority.filter((p) => set.has(p)),
      ...Array.from(set).filter((k) => !priority.includes(k)),
    ];
  }, [rows]);

  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const col of FILTERABLE_COLUMNS) {
      const values = new Set<string>();
      rows.forEach((r) => {
        const v = resolveField(r, col.candidates);
        if (v) values.add(v);
      });
      options[col.key] = Array.from(values).sort();
    }
    return options;
  }, [rows]);

  const filteredSorted = useMemo(() => {
    let result = rows.filter((r) => {
      const matchesSearch =
        !search || Object.values(r).some((v) => v.toLowerCase().includes(search.toLowerCase()));
      const matchesFilters = FILTERABLE_COLUMNS.every((col) => {
        const active = filters[col.key];
        if (!active) return true;
        return resolveField(r, col.candidates) === active;
      });
      return matchesSearch && matchesFilters;
    });

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, search, filters, sortKey, sortDir]);

  function toggleSort(col: string) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  function handleExportExcel() {
    if (!filteredSorted.length) return toast.error("لا توجد بيانات لتصديرها");
    const ws = XLSX.utils.json_to_sheet(filteredSorted);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `user-manager-report_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (!routers.length) {
    return (
      <p className="text-sm text-muted-foreground">
        أضف راوترًا من صفحة "أجهزة MikroTik" أولًا لتفعيل التقارير.
      </p>
    );
  }

  if (!selectedRouterId) {
    return (
      <p className="text-sm text-muted-foreground">
        اختر راوترًا افتراضيًا من صفحة "أجهزة MikroTik" لعرض تقاريره.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>تقرير جلسات User Manager</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel} disabled={!filteredSorted.length}>
              <Download className="h-4 w-4" />
              تصدير Excel
            </Button>
            <Button onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending}>
              <RefreshCw className={`h-4 w-4 ${reportMutation.isPending ? "animate-spin" : ""}`} />
              {reportMutation.isPending ? "جارٍ التحميل..." : "تحميل التقرير"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {reportMutation.data && (
            <p className="text-xs text-muted-foreground">
              آخر تحميل: {new Date(reportMutation.data.fetchedAt).toLocaleString("ar")} ·{" "}
              {rows.length} سجل
            </p>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  placeholder="بحث..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
                />
                {FILTERABLE_COLUMNS.map((col) => (
                  <select
                    key={col.key}
                    className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
                    value={filters[col.key] ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, [col.key]: e.target.value }))
                    }
                  >
                    <option value="">{col.label}: الكل</option>
                    {(filterOptions[col.key] ?? []).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ))}
              </div>

              <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60">
                    <tr>
                      {allColumns.map((col) => (
                        <th
                          key={col}
                          onClick={() => toggleSort(col)}
                          className="cursor-pointer whitespace-nowrap px-3 py-2 text-right font-medium"
                        >
                          <span className="inline-flex items-center gap-1">
                            {col}
                            {sortKey === col &&
                              (sortDir === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              ))}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSorted.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        {allColumns.map((col) => (
                          <td key={col} className="whitespace-nowrap px-3 py-2">
                            {row[col] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredSorted.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  لا توجد سجلات مطابقة للفلاتر الحالية
                </p>
              )}
            </>
          )}

          {!rows.length && !reportMutation.isPending && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              اضغط "تحميل التقرير" لجلب بيانات الجلسات من الراوتر
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
