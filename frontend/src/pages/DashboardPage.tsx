import { Card, CardContent } from "@/components/ui/card";
import { libraryApi, routersApi } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, FileSpreadsheet, FileText, Router as RouterIcon } from "lucide-react";

export function DashboardPage() {
  const { data: files = [] } = useQuery({ queryKey: ["library"], queryFn: libraryApi.list });
  const { data: routers = [] } = useQuery({ queryKey: ["routers"], queryFn: routersApi.list });

  const counts = {
    pdf: files.filter((f) => f.file_type === "pdf").length,
    txt: files.filter((f) => f.file_type === "txt").length,
    xlsx: files.filter((f) => f.file_type === "xlsx").length,
    total: files.length,
  };

  const lastGeneration = files[0]?.created_at;

  const stats = [
    { label: "إجمالي الملفات المولدة", value: counts.total, icon: FileText },
    { label: "ملفات PDF", value: counts.pdf, icon: FileText },
    { label: "ملفات TXT", value: counts.txt, icon: FileText },
    { label: "ملفات Excel", value: counts.xlsx, icon: FileSpreadsheet },
    { label: "أجهزة MikroTik المسجلة", value: routers.length, icon: RouterIcon },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex flex-col gap-3 p-5">
              <Icon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold">آخر عملية توليد</p>
            <p className="text-sm text-muted-foreground">
              {lastGeneration ? new Date(lastGeneration).toLocaleString("ar") : "لا يوجد بعد"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
