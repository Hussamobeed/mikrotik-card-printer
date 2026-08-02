import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { routersApi, syncApi } from "@/services/api";
import { useAppStore } from "@/stores/appStore";
import { RouterInput, RouterPublic } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plug, Plus, RefreshCw, Star, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const emptyForm: RouterInput = {
  name: "",
  host: "",
  port: 8728,
  username: "admin",
  password: "",
  sslEnabled: false,
  description: "",
  isDefault: false,
};

export function RoutersPage() {
  const qc = useQueryClient();
  const { selectedRouterId, setSelectedRouterId } = useAppStore();
  const [form, setForm] = useState<RouterInput>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const { data: routers = [], isLoading } = useQuery({
    queryKey: ["routers"],
    queryFn: routersApi.list,
  });

  // If there's exactly one router and none is selected yet, select it
  // automatically — no reason to make the user click "select" for a single device.
  useEffect(() => {
    if (!selectedRouterId && routers.length === 1) {
      setSelectedRouterId(routers[0].id);
    }
  }, [routers, selectedRouterId, setSelectedRouterId]);

  const createMutation = useMutation({
    mutationFn: routersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routers"] });
      setForm(emptyForm);
      setShowForm(false);
      toast.success("تمت إضافة الراوتر");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: routersApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routers"] });
      toast.success("تم حذف الراوتر");
    },
  });

  async function handleTestConnection(router: RouterPublic) {
    const toastId = toast.loading(`اختبار الاتصال بـ ${router.name}...`);
    try {
      const result = await routersApi.testConnection(router.id);
      toast.success(`متصل: ${result.identity} (RouterOS ${result.routerosVersion})`, {
        id: toastId,
      });
      setSelectedRouterId(router.id);
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    }
  }

  async function handleSync(router: RouterPublic) {
    const toastId = toast.loading(`جارٍ مزامنة ${router.name}...`);
    try {
      const result = await syncApi.run(router.id);
      toast.success(
        `تمت المزامنة: ${result.usersCount} مستخدم، ${result.activeSessionsCount} جلسة نشطة`,
        { id: toastId }
      );
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          إدارة أجهزة MikroTik. كلمات المرور مشفّرة ولا تُرسل أبدًا إلى المتصفح.
        </p>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          إضافة راوتر
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>راوتر جديد</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>الاسم</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>عنوان IP</Label>
              <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
            </div>
            <div>
              <Label>منفذ API</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>اسم المستخدم</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <Label>الوصف (اختياري)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.sslEnabled}
                  onChange={(e) => setForm({ ...form, sslEnabled: e.target.checked })}
                />
                تفعيل SSL (API-SSL)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                />
                جعله الراوتر الافتراضي
              </label>
            </div>
            <div className="sm:col-span-2">
              <Button
                className="w-full"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                حفظ الراوتر
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}
        {routers.map((router) => (
          <Card
            key={router.id}
            className={selectedRouterId === router.id ? "ring-2 ring-primary" : undefined}
          >
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {router.name}
                  {router.isDefault && <Star className="h-3.5 w-3.5 fill-primary text-primary" />}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {router.host}:{router.port} · {router.username}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate(router.id)}
                title="حذف"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {router.description && (
                <p className="text-sm text-muted-foreground">{router.description}</p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => handleTestConnection(router)}>
                  <Plug className="h-3.5 w-3.5" />
                  اختبار
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleSync(router)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  مزامنة
                </Button>
                <Button
                  variant={selectedRouterId === router.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedRouterId(router.id)}
                >
                  {selectedRouterId === router.id ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {selectedRouterId === router.id ? "محدد" : "تحديد"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
