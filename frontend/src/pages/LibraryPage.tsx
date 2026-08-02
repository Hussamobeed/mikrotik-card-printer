import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { exportApi, libraryApi, routersApi } from "@/services/api";
import { useAppStore } from "@/stores/appStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Pencil, Search, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

const typeLabels: Record<string, string> = {
  txt: "نصي (TXT)",
  pdf: "PDF",
  xlsx: "Excel",
  "mikrotik-script": "سكريبت MikroTik",
};

export function LibraryPage() {
  const qc = useQueryClient();
  const { selectedRouterId } = useAppStore();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const { data: routers = [] } = useQuery({ queryKey: ["routers"], queryFn: routersApi.list });

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["library"],
    queryFn: libraryApi.list,
  });

  const removeMutation = useMutation({
    mutationFn: libraryApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library"] });
      toast.success("تم حذف الملف");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: libraryApi.duplicate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library"] });
      toast.success("تم إنشاء نسخة من الملف");
    },
  });

  const filtered = useMemo(() => {
    let result = files.filter((f) => {
      const matchesSearch =
        !search ||
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.customer ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (f.profile ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || f.file_type === typeFilter;
      return matchesSearch && matchesType;
    });
    result = result.sort((a, b) =>
      sortDesc
        ? b.created_at.localeCompare(a.created_at)
        : a.created_at.localeCompare(b.created_at)
    );
    return result;
  }, [files, search, typeFilter, sortDesc]);

  async function handleRename(id: string, currentName: string) {
    const newName = window.prompt("الاسم الجديد:", currentName);
    if (!newName || newName === currentName) return;
    await libraryApi.rename(id, newName);
    qc.invalidateQueries({ queryKey: ["library"] });
  }

  async function handleExportAgain(id: string, fileName: string) {
    if (!selectedRouterId) {
      toast.error("اختر راوترًا افتراضيًا من صفحة \"أجهزة MikroTik\" أولًا");
      return;
    }
    setExportingId(id);
    const toastId = toast.loading("جارٍ رفع الملف وتنفيذه على الراوتر...");
    try {
      await exportApi.run({ routerId: selectedRouterId, fileName, libraryFileId: id });
      toast.success("تم التصدير والتنفيذ على MikroTik بنجاح", { id: toastId });
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    } finally {
      setExportingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-9"
            placeholder="بحث بالاسم أو العميل أو البروفايل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">كل الأنواع</option>
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => setSortDesc((v) => !v)}>
          {sortDesc ? "الأحدث أولًا" : "الأقدم أولًا"}
        </Button>
      </div>

      {routers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedRouterId
            ? `التصدير مجددًا يستخدم الراوتر المحدد حاليًا: ${
                routers.find((r) => r.id === selectedRouterId)?.name ?? ""
              }`
            : 'لم يتم تحديد راوتر بعد. اختر راوترًا من صفحة "أجهزة MikroTik" لتفعيل التصدير مجددًا.'}
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">لا توجد ملفات مطابقة</p>
      )}

      <div className="space-y-2">
        {filtered.map((file) => (
          <Card key={file.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {typeLabels[file.file_type] ?? file.file_type}
                  {file.customer ? ` · العميل: ${file.customer}` : ""}
                  {file.profile ? ` · البروفايل: ${file.profile}` : ""}
                  {file.number_count ? ` · ${file.number_count} رقم` : ""}
                  {" · "}
                  {new Date(file.created_at).toLocaleString("ar")}
                </p>
              </div>
              <div className="flex gap-1">
                {(file.file_type === "mikrotik-script" || file.file_type === "txt") && (
                  <Button
                    variant="outline"
                    size="icon"
                    title="تصدير إلى MikroTik مجددًا"
                    disabled={exportingId === file.id}
                    onClick={() => handleExportAgain(file.id, file.name)}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  title="تنزيل"
                  onClick={() => libraryApi.download(file.id, file.name)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="إعادة تسمية"
                  onClick={() => handleRename(file.id, file.name)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="نسخ"
                  onClick={() => duplicateMutation.mutate(file.id)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="حذف"
                  onClick={() => removeMutation.mutate(file.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
