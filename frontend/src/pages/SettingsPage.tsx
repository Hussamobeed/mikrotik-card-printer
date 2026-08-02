import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsApi } from "@/services/api";
import { useGeneratorStore } from "@/stores/generatorStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useState } from "react";
import toast from "react-hot-toast";

export function SettingsPage() {
  const qc = useQueryClient();
  const { settings, layout } = useGeneratorStore();
  const [presetName, setPresetName] = useState("");

  const { data: presets = [] } = useQuery({
    queryKey: ["presets"],
    queryFn: settingsApi.presets.list,
  });

  const createPreset = useMutation({
    mutationFn: () => settingsApi.presets.create(presetName, { settings, layout }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presets"] });
      setPresetName("");
      toast.success("تم حفظ الإعداد المسبق (Preset)");
    },
  });

  const deletePreset = useMutation({
    mutationFn: (id: string) => settingsApi.presets.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["presets"] }),
  });

  async function handleExportConfig() {
    const data = await settingsApi.exportJson();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "obaid-manager-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportConfig(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        await settingsApi.importJson(parsed);
        toast.success("تم استيراد الإعدادات بنجاح");
      } catch (err) {
        toast.error("ملف إعدادات غير صالح");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>استيراد / تصدير الإعدادات</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleExportConfig}>
            <Download className="h-4 w-4" />
            تصدير الإعدادات JSON
          </Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-secondary">
            <Upload className="h-4 w-4" />
            استيراد إعدادات JSON
            <input type="file" accept="application/json" className="hidden" onChange={handleImportConfig} />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الإعدادات المسبقة (Presets)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>اسم الإعداد المسبق</Label>
              <Input
                placeholder="مثال: A4 - كروت كبيرة"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
            </div>
            <Button
              className="self-end"
              disabled={!presetName || createPreset.isPending}
              onClick={() => createPreset.mutate()}
            >
              <Plus className="h-4 w-4" />
              حفظ الإعدادات الحالية كـ Preset
            </Button>
          </div>

          <div className="space-y-2">
            {presets.map((p: { id: string; name: string; created_at: string }) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <Button variant="ghost" size="icon" onClick={() => deletePreset.mutate(p.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {!presets.length && (
              <p className="text-sm text-muted-foreground">لا توجد إعدادات مسبقة محفوظة بعد.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
