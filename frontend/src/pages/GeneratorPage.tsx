import { LivePreview } from "@/components/generator/LivePreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { exportApi, libraryApi, routersApi, syncApi, templatesApi } from "@/services/api";
import { useAppStore } from "@/stores/appStore";
import { defaultLayout, useGeneratorStore } from "@/stores/generatorStore";
import { PrintTemplate } from "@/types";
import { buildFileName, generateCards } from "@/utils/cardGenerator";
import {
  downloadTextFile,
  exportAsExcel,
  exportAsExcelBlob,
  generateCardsPdf,
} from "@/utils/exporters";
import { useQuery } from "@tanstack/react-query";
import { Redo2, SwatchBook, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export function GeneratorPage() {
  const {
    settings,
    printOptions,
    layout,
    activeTemplateId,
    numbers,
    script,
    setSettings,
    setPrintOptions,
    applyTemplate,
    setResult,
    undo,
    redo,
    historyIndex,
    history,
  } = useGeneratorStore();
  const { selectedRouterId, setLastCustomer, setLastProfile } = useAppStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportLog, setExportLog] = useState<string[]>([]);

  const { data: routers = [] } = useQuery({ queryKey: ["routers"], queryFn: routersApi.list });

  const { data: templates = [] } = useQuery<PrintTemplate[]>({
    queryKey: ["templates"],
    queryFn: templatesApi.list,
  });

  // Auto-apply a matching print template whenever the selected profile has
  // one linked to it — the Generator page never edits layout directly anymore,
  // it only picks which saved template is active.
  useEffect(() => {
    if (!settings.profile) return;
    const match = templates.find((t) => t.profile === settings.profile);
    if (match && match.id !== activeTemplateId) {
      applyTemplate(match.id, match.layout);
      toast.success(`تم تطبيق قالب الطباعة الخاص بـ "${settings.profile}" تلقائيًا`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.profile, templates]);

  const { data: syncCache } = useQuery({
    queryKey: ["sync-cache", selectedRouterId],
    queryFn: () => syncApi.cache(selectedRouterId as string),
    enabled: !!selectedRouterId,
  });

  const availableCustomers = syncCache?.customers ?? [];
  const availableProfiles = syncCache?.profiles ?? [];

  const [customerMode, setCustomerMode] = useState<"select" | "manual">("manual");
  const [profileMode, setProfileMode] = useState<"select" | "manual">("manual");

  useEffect(() => {
    if (availableCustomers.length) setCustomerMode("select");
  }, [availableCustomers.length]);

  useEffect(() => {
    if (availableProfiles.length) setProfileMode("select");
  }, [availableProfiles.length]);

  async function handleGenerate() {
    try {
      const result = generateCards(settings);
      setResult(result.numbers, result.script);
      setLastCustomer(settings.customer);
      setLastProfile(settings.profile);
      toast.success(`تم توليد ${result.numbers.length} رقم بنجاح`);

      // Auto-save to library (script + PDF) — works on mobile & PC
      await autoSaveToLibrary(result.numbers, result.script);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function autoSaveToLibrary(numbers: string[], script: string) {
    const name = fileNameFor("auto");
    try {
      // 1. Save script
      await libraryApi.upload(new Blob([script], { type: "text/plain" }), {
        name: `${name}.rsc`,
        fileType: "mikrotik-script",
        customer: settings.customer,
        profile: settings.profile,
        prefix: settings.beginNumber,
        numberCount: numbers.length,
      });

      // 2. Save PDF
      const pdfBlob = await generateCardsPdf(numbers, layout, printOptions);
      await libraryApi.upload(pdfBlob, {
        name: `${name}.pdf`,
        fileType: "pdf",
        customer: settings.customer,
        profile: settings.profile,
        prefix: settings.beginNumber,
        numberCount: numbers.length,
      });

      toast.success("تم الحفظ التلقائي في المكتبة (سكريبت + PDF)");
    } catch (err) {
      // Auto-save failure should not block the user — just warn silently
      console.error("Auto-save failed:", err);
    }
  }

  function fileNameFor(type: string) {
    return buildFileName({
      fileType: type,
      profile: settings.profile,
      prefix: settings.beginNumber,
      count: numbers.length,
    });
  }

  async function handleSaveTxt() {
    if (!numbers.length) return toast.error("قم بتوليد الأرقام أولًا");
    const name = fileNameFor("txt");
    downloadTextFile(numbers.join("\n"), `${name}.txt`);
    await libraryApi.upload(new Blob([numbers.join("\n")], { type: "text/plain" }), {
      name: `${name}.txt`,
      fileType: "txt",
      customer: settings.customer,
      profile: settings.profile,
      prefix: settings.beginNumber,
      numberCount: numbers.length,
    });
    toast.success("تم حفظ ملف الأرقام (TXT) في المكتبة");
  }

  async function handleSaveScript() {
    if (!script) return toast.error("قم بتوليد السكريبت أولًا");
    const name = fileNameFor("mikrotik");
    downloadTextFile(script, `${name}.rsc`);
    await libraryApi.upload(new Blob([script], { type: "text/plain" }), {
      name: `${name}.rsc`,
      fileType: "mikrotik-script",
      customer: settings.customer,
      profile: settings.profile,
      prefix: settings.beginNumber,
      numberCount: numbers.length,
    });
    toast.success("تم حفظ سكريبت MikroTik في المكتبة");
  }

  async function handleSaveExcel() {
    if (!numbers.length) return toast.error("قم بتوليد الأرقام أولًا");
    const name = fileNameFor("excel");
    exportAsExcel(numbers, settings, name);
    const blob = exportAsExcelBlob(numbers, settings);
    await libraryApi.upload(blob, {
      name: `${name}.xlsx`,
      fileType: "xlsx",
      customer: settings.customer,
      profile: settings.profile,
      prefix: settings.beginNumber,
      numberCount: numbers.length,
    });
    toast.success("تم حفظ ملف Excel في المكتبة");
  }

  async function handleGeneratePdf() {
    if (!numbers.length) return toast.error("قم بتوليد الأرقام أولًا");
    const name = fileNameFor("pdf");
    const blob = await generateCardsPdf(numbers, layout, printOptions);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    await libraryApi.upload(blob, {
      name: `${name}.pdf`,
      fileType: "pdf",
      customer: settings.customer,
      profile: settings.profile,
      prefix: settings.beginNumber,
      numberCount: numbers.length,
    });
    toast.success("تم إنشاء وحفظ ملف PDF");
  }

  async function handleExportToMikroTik() {
    if (!script) return toast.error("قم بتوليد السكريبت أولًا");
    if (!selectedRouterId) return toast.error("اختر راوترًا من صفحة الأجهزة أولًا");
    setIsExporting(true);
    setExportLog([]);
    const toastId = toast.loading("جارٍ رفع السكريبت وتنفيذه على الراوتر...");
    try {
      const name = `${fileNameFor("mikrotik")}.rsc`;
      const result = await exportApi.run({
        routerId: selectedRouterId,
        fileName: name,
        scriptContent: script,
      });
      toast.success("تم التصدير والتنفيذ على MikroTik بنجاح", { id: toastId });
      setExportLog(result.log);
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
      setExportLog([(err as Error).message]);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>توليد الأرقام والسكريبت</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>بداية كل رقم</Label>
                <Input
                  value={settings.beginNumber}
                  onChange={(e) => setSettings({ beginNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>طول رقم الكرت</Label>
                <Input
                  type="number"
                  min={5}
                  value={settings.numLength}
                  onChange={(e) => setSettings({ numLength: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>عدد الأرقام المراد توليدها</Label>
              <Input
                type="number"
                min={1}
                value={settings.numCount}
                onChange={(e) => setSettings({ numCount: Number(e.target.value) })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="mb-0">العميل (Customer)</Label>
                  {!!availableCustomers.length && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        setCustomerMode((m) => (m === "select" ? "manual" : "select"))
                      }
                    >
                      {customerMode === "select" ? "إدخال يدوي" : "اختيار من القائمة"}
                    </button>
                  )}
                </div>
                {customerMode === "select" && availableCustomers.length ? (
                  <Select
                    value={settings.customer}
                    onChange={(e) => setSettings({ customer: e.target.value })}
                  >
                    <option value="">اختر عميلًا...</option>
                    {availableCustomers.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={settings.customer}
                    onChange={(e) => setSettings({ customer: e.target.value })}
                  />
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="mb-0">البروفايل (Profile)</Label>
                  {!!availableProfiles.length && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() =>
                        setProfileMode((m) => (m === "select" ? "manual" : "select"))
                      }
                    >
                      {profileMode === "select" ? "إدخال يدوي" : "اختيار من القائمة"}
                    </button>
                  )}
                </div>
                {profileMode === "select" && availableProfiles.length ? (
                  <Select
                    value={settings.profile}
                    onChange={(e) => setSettings({ profile: e.target.value })}
                  >
                    <option value="">اختر بروفايلًا...</option>
                    {availableProfiles.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={settings.profile}
                    onChange={(e) => setSettings({ profile: e.target.value })}
                  />
                )}
              </div>
            </div>
            {!selectedRouterId && (
              <p className="text-xs text-muted-foreground">
                لعرض العملاء والبروفايلات من الراوتر مباشرة، اختر راوترًا افتراضيًا وقم بالمزامنة
                من صفحة "أجهزة MikroTik".
              </p>
            )}
            {selectedRouterId && !availableCustomers.length && (
              <p className="text-xs text-muted-foreground">
                لا توجد بيانات مزامنة محفوظة لهذا الراوتر بعد. اضغط "مزامنة" من صفحة الأجهزة لجلب
                العملاء والبروفايلات، أو أدخلهم يدويًا.
              </p>
            )}
            <div>
              <Label>التعليق (اختياري)</Label>
              <Input
                value={settings.comment}
                onChange={(e) => setSettings({ comment: e.target.value })}
              />
            </div>
            <div>
              <Label>نوع كلمة المرور</Label>
              <Select
                value={settings.passwordType}
                onChange={(e) =>
                  setSettings({ passwordType: e.target.value as "same" | "empty" })
                }
              >
                <option value="same">نفس الرقم</option>
                <option value="empty">فارغ</option>
              </Select>
            </div>
            <Button className="w-full" onClick={handleGenerate}>
              توليد الأرقام والسكريبت
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>خيارات الطباعة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <SwatchBook className="h-4 w-4 shrink-0 text-primary" />
              {activeTemplateId ? (
                <span>
                  القالب الفعّال: <strong>{templates.find((t) => t.id === activeTemplateId)?.name ?? "—"}</strong>
                </span>
              ) : (
                <span className="text-muted-foreground">لا يوجد قالب مطبَّق — سيُستخدم التصميم الافتراضي</span>
              )}
            </div>
            <div>
              <Label>اختيار قالب الطباعة يدويًا</Label>
              <Select
                value={activeTemplateId ?? ""}
                onChange={(e) => {
                  const t = templates.find((tt) => tt.id === e.target.value);
                  applyTemplate(t?.id ?? null, t?.layout ?? defaultLayout);
                }}
              >
                <option value="">افتراضي (بدون قالب)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.profile ? ` — ${t.profile}` : ""}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                شكل القالب (الموضع، الألوان، الخط، الخلفية) يُدار بالكامل من صفحة "قوالب الطباعة".
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={printOptions.useSerialNumber}
                onChange={(e) => setPrintOptions({ useSerialNumber: e.target.checked })}
              />
              طباعة رقم تسلسلي
            </label>
            {printOptions.useSerialNumber && (
              <div>
                <Label>يبدأ الترقيم من</Label>
                <Input
                  type="number"
                  value={printOptions.serialStartNumber}
                  onChange={(e) => setPrintOptions({ serialStartNumber: Number(e.target.value) })}
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={printOptions.useDatePrinting}
                onChange={(e) => setPrintOptions({ useDatePrinting: e.target.checked })}
              />
              طباعة التاريخ
            </label>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={printOptions.useCustomText}
                onChange={(e) => setPrintOptions({ useCustomText: e.target.checked })}
              />
              طباعة نص اختياري
            </label>
            {printOptions.useCustomText && (
              <div>
                <Label>محتوى النص</Label>
                <Input
                  value={printOptions.customText}
                  onChange={(e) => setPrintOptions({ customText: e.target.value })}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>معاينة حية</CardTitle>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={historyIndex <= 0}
                onClick={undo}
                title="تراجع"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={historyIndex >= history.length - 1}
                onClick={redo}
                title="إعادة"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <LivePreview
              sampleNumber={numbers[0] ?? ""}
              layout={layout}
              printOptions={printOptions}
              editable={false}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الأرقام المولدة والسكريبت ({numbers.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              readOnly
              value={script}
              className="h-56 w-full resize-y rounded-lg border border-border bg-secondary/40 p-3 font-mono text-xs"
              dir="ltr"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button variant="secondary" onClick={handleSaveTxt}>
                حفظ TXT
              </Button>
              <Button variant="secondary" onClick={handleSaveScript}>
                حفظ سكريبت MikroTik
              </Button>
              <Button variant="secondary" onClick={handleSaveExcel}>
                حفظ Excel
              </Button>
              <Button variant="secondary" onClick={handleGeneratePdf}>
                إنشاء PDF
              </Button>
            </div>
            <Button
              className="w-full"
              disabled={isExporting || !routers.length}
              onClick={handleExportToMikroTik}
            >
              {isExporting ? "جارٍ التصدير..." : "تصدير إلى MikroTik (رفع + تنفيذ + حذف)"}
            </Button>
            {!routers.length && (
              <p className="text-center text-xs text-muted-foreground">
                أضف راوترًا من صفحة "أجهزة MikroTik" لتفعيل التصدير المباشر
              </p>
            )}
            {exportLog.length > 0 && (
              <pre
                className="max-h-40 overflow-auto rounded-lg border border-border bg-secondary/40 p-3 text-xs"
                dir="ltr"
              >
                {exportLog.join("\n")}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
