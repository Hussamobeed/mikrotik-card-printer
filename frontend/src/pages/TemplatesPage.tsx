import { LivePreview } from "@/components/generator/LivePreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { syncApi, templatesApi } from "@/services/api";
import { defaultLayout } from "@/stores/generatorStore";
import { useAppStore } from "@/stores/appStore";
import { PdfLayoutSettings, PrintTemplate } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { ChangeEvent, useState } from "react";
import toast from "react-hot-toast";

export function TemplatesPage() {
  const qc = useQueryClient();
  const { selectedRouterId } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState("");
  const [layout, setLocalLayout] = useState<PdfLayoutSettings>(defaultLayout);

  const { data: templates = [] } = useQuery<PrintTemplate[]>({
    queryKey: ["templates"],
    queryFn: templatesApi.list,
  });

  const { data: syncCache } = useQuery({
    queryKey: ["sync-cache", selectedRouterId],
    queryFn: () => syncApi.cache(selectedRouterId as string),
    enabled: !!selectedRouterId,
  });
  const availableProfiles = syncCache?.profiles ?? [];

  function patchLayout(partial: Partial<PdfLayoutSettings>) {
    setLocalLayout((l) => ({ ...l, ...partial }));
  }

  function handleBackgroundUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => patchLayout({ backgroundImageDataUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
  }

  function startNew() {
    setEditingId(null);
    setName("");
    setProfile("");
    setLocalLayout(defaultLayout);
  }

  function startEdit(t: PrintTemplate) {
    setEditingId(t.id);
    setName(t.name);
    setProfile(t.profile ?? "");
    setLocalLayout({ ...defaultLayout, ...t.layout });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId
        ? templatesApi.update(editingId, { name, profile: profile || null, layout })
        : templatesApi.create(name, profile || null, layout),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("تم حفظ القالب");
      startNew();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("تم حذف القالب");
    },
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{editingId ? "تعديل القالب" : "قالب جديد"}</CardTitle>
            {editingId && (
              <Button variant="outline" size="sm" onClick={startNew}>
                <Plus className="h-3.5 w-3.5" />
                جديد
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>اسم القالب</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>البروفايل المرتبط (اختياري)</Label>
              {availableProfiles.length ? (
                <Select value={profile} onChange={(e) => setProfile(e.target.value)}>
                  <option value="">بدون ارتباط</option>
                  {availableProfiles.map((p: { name: string }) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  placeholder="اكتب اسم البروفايل كما في MikroTik"
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                />
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                عند اختيار هذا البروفايل في صفحة التوليد، سيُطبَّق هذا القالب تلقائيًا.
              </p>
            </div>

            <Tabs defaultValue="number">
              <TabsList className="w-full flex-wrap">
                <TabsTrigger value="number">رقم الكرت</TabsTrigger>
                <TabsTrigger value="serial">الرقم التسلسلي</TabsTrigger>
                <TabsTrigger value="date">التاريخ</TabsTrigger>
                <TabsTrigger value="customText">نص اختياري</TabsTrigger>
                <TabsTrigger value="page">الصفحة والخلفية</TabsTrigger>
              </TabsList>

              {/* ---- Card number styling ---- */}
              <TabsContent value="number">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>الحجم</Label>
                      <Input
                        type="number"
                        value={layout.textSize}
                        onChange={(e) => patchLayout({ textSize: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>X</Label>
                      <Input
                        type="number"
                        value={layout.textPositionX}
                        onChange={(e) => patchLayout({ textPositionX: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Y</Label>
                      <Input
                        type="number"
                        value={layout.textPositionY}
                        onChange={(e) => patchLayout({ textPositionY: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <Label>الخط</Label>
                      <Select value={layout.font} onChange={(e) => patchLayout({ font: e.target.value })}>
                        <option value="helvetica">Helvetica</option>
                        <option value="times">Times</option>
                        <option value="courier">Courier</option>
                      </Select>
                    </div>
                    <div>
                      <Label>الوزن</Label>
                      <Select
                        value={layout.fontWeight}
                        onChange={(e) => patchLayout({ fontWeight: e.target.value as "normal" | "bold" })}
                      >
                        <option value="normal">عادي</option>
                        <option value="bold">عريض</option>
                      </Select>
                    </div>
                    <div>
                      <Label>اللون</Label>
                      <input
                        type="color"
                        className="h-10 w-full rounded-lg border border-border"
                        value={layout.textColor}
                        onChange={(e) => patchLayout({ textColor: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>المحاذاة</Label>
                      <Select
                        value={layout.textAlign}
                        onChange={(e) =>
                          patchLayout({ textAlign: e.target.value as "left" | "center" | "right" })
                        }
                      >
                        <option value="left">يسار</option>
                        <option value="center">وسط</option>
                        <option value="right">يمين</option>
                      </Select>
                    </div>
                    <div>
                      <Label>الدوران (درجة)</Label>
                      <Input
                        type="number"
                        value={layout.textRotation}
                        onChange={(e) => patchLayout({ textRotation: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ---- Serial number styling ---- */}
              <TabsContent value="serial">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>الحجم</Label>
                    <Input
                      type="number"
                      value={layout.serialNumberSize}
                      onChange={(e) => patchLayout({ serialNumberSize: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>اللون</Label>
                    <input
                      type="color"
                      className="h-10 w-full rounded-lg border border-border"
                      value={layout.serialColor}
                      onChange={(e) => patchLayout({ serialColor: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>X</Label>
                    <Input
                      type="number"
                      value={layout.serialPositionX}
                      onChange={(e) => patchLayout({ serialPositionX: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Y</Label>
                    <Input
                      type="number"
                      value={layout.serialPositionY}
                      onChange={(e) => patchLayout({ serialPositionY: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  هل يُطبع الرقم التسلسلي أصلًا، ومن أي رقم يبدأ — يُحدَّد لاحقًا في صفحة التوليد، لكن مكانه وشكله محددان هنا.
                </p>
              </TabsContent>

              {/* ---- Date styling ---- */}
              <TabsContent value="date">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>الحجم</Label>
                    <Input
                      type="number"
                      value={layout.dateSize}
                      onChange={(e) => patchLayout({ dateSize: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>اللون</Label>
                    <input
                      type="color"
                      className="h-10 w-full rounded-lg border border-border"
                      value={layout.dateColor}
                      onChange={(e) => patchLayout({ dateColor: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>X</Label>
                    <Input
                      type="number"
                      value={layout.datePositionX}
                      onChange={(e) => patchLayout({ datePositionX: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Y</Label>
                    <Input
                      type="number"
                      value={layout.datePositionY}
                      onChange={(e) => patchLayout({ datePositionY: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* ---- Custom text styling ---- */}
              <TabsContent value="customText">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>الحجم</Label>
                    <Input
                      type="number"
                      value={layout.customTextSize}
                      onChange={(e) => patchLayout({ customTextSize: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>اللون</Label>
                    <input
                      type="color"
                      className="h-10 w-full rounded-lg border border-border"
                      value={layout.customTextColor}
                      onChange={(e) => patchLayout({ customTextColor: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>X</Label>
                    <Input
                      type="number"
                      value={layout.customTextPositionX}
                      onChange={(e) => patchLayout({ customTextPositionX: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Y</Label>
                    <Input
                      type="number"
                      value={layout.customTextPositionY}
                      onChange={(e) => patchLayout({ customTextPositionY: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  محتوى النص نفسه يُكتب لاحقًا في صفحة التوليد — هنا فقط شكله وموضعه.
                </p>
              </TabsContent>

              {/* ---- Page / background / border ---- */}
              <TabsContent value="page">
                <div className="space-y-4">
                  <div>
                    <Label>رفع صورة الخلفية</Label>
                    <Input type="file" accept="image/*" onChange={handleBackgroundUpload} />
                  </div>
                  {layout.backgroundImageDataUrl && (
                    <div>
                      <Label>طريقة عرض الخلفية</Label>
                      <Select
                        value={layout.backgroundFit}
                        onChange={(e) =>
                          patchLayout({ backgroundFit: e.target.value as "contain" | "cover" | "stretch" })
                        }
                      >
                        <option value="contain">احتواء كامل (Autofit)</option>
                        <option value="cover">تغطية الكرت بالكامل</option>
                        <option value="stretch">تمديد لملء الكرت</option>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>الأعمدة</Label>
                      <Input
                        type="number"
                        value={layout.columns}
                        onChange={(e) => patchLayout({ columns: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>الصفوف</Label>
                      <Input
                        type="number"
                        value={layout.rows}
                        onChange={(e) => patchLayout({ rows: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>التباعد</Label>
                      <Input
                        type="number"
                        value={layout.boxSpacing}
                        onChange={(e) => patchLayout({ boxSpacing: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={layout.useBorder}
                      onChange={(e) => patchLayout({ useBorder: e.target.checked })}
                    />
                    طباعة حدود للكرت
                  </label>
                  {layout.useBorder && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>سمك الحدود (px)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={layout.borderWidth}
                          onChange={(e) => patchLayout({ borderWidth: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label>لون الحدود</Label>
                        <input
                          type="color"
                          className="h-10 w-full rounded-lg border border-border"
                          value={layout.borderColor}
                          onChange={(e) => patchLayout({ borderColor: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <Button
              className="w-full"
              disabled={!name || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {editingId ? "حفظ التعديلات" : "حفظ القالب"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>معاينة (كل العناصر ظاهرة هنا لتسهيل التموضع)</CardTitle>
          </CardHeader>
          <CardContent>
            <LivePreview
              sampleNumber="12345678"
              layout={layout}
              editable
              onLayoutChange={patchLayout}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>القوالب المحفوظة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <button className="text-right" onClick={() => startEdit(t)}>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.profile ? `مرتبط بـ: ${t.profile}` : "غير مرتبط ببروفايل"}
                  </p>
                </button>
                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {!templates.length && (
              <p className="text-sm text-muted-foreground">لا توجد قوالب محفوظة بعد.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
