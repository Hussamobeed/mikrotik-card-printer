import { GenerationResult, GeneratorSettings } from "@/types";

/**
 * Faithful port of the original generateNumbers() logic from the legacy HTML tool.
 * - Generates `numCount` unique random numeric strings of length `numLength`,
 *   each starting with `beginNumber`, padded with random digits.
 * - Builds the MikroTik User Manager script exactly as before (add + create-and-activate-profile),
 *   including the run-date variable and log lines.
 */
export function generateCards(settings: GeneratorSettings): GenerationResult {
  const customer = settings.customer.trim().replace(/\s+/g, "");
  const comment = settings.comment.trim().replace(/\s+/g, "");
  const profile = settings.profile.trim().replace(/\s+/g, "");
  const { passwordType, numLength: length, numCount: count } = settings;

  if (length < 5) {
    throw new Error("خطأ: يجب أن يكون طول الرقم 5 أو أكثر!");
  }
  if (count < 1) {
    throw new Error("خطأ: عدد الأرقام يجب أن يكون 1 أو أكثر!");
  }

  const numbers: string[] = [];
  const seen = new Set<string>();
  let script = "";

  // Escape values for RouterOS script safety (spaces, quotes, semicolons)
  const rosStr = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

  script += `/log info "بدء إنشاء المستخدمين للعميل ${rosStr(customer)}";\n`;
  script += `:local scriptRunDate [/system clock get date];\n`;

  // Safety cap to avoid an infinite loop if length/count combination can't produce
  // enough unique values (mirrors original behavior but guards against hangs).
  const maxAttempts = count * 200 + 10000;
  let attempts = 0;

  while (numbers.length < count && attempts < maxAttempts) {
    attempts++;
    let candidate = settings.beginNumber.toString();
    while (candidate.length < length) {
      candidate += Math.floor(Math.random() * 10);
    }

    if (seen.has(candidate)) continue;
    seen.add(candidate);
    numbers.push(candidate);

    const password = passwordType === "same" ? candidate : '""';

    script +=
      `/log info "إنشاء مستخدم جديد: ${rosStr(candidate)}";\n` +
      `/tool user-manager user add customer=${rosStr(customer)} username=${rosStr(candidate)} password=${rosStr(password)} first-name=$scriptRunDate comment=${rosStr(comment)};\n` +
      `/tool user-manager user create-and-activate-profile customer=${rosStr(customer)} profile=${rosStr(profile)} ${rosStr(candidate)};\n`;
  }

  if (numbers.length < count) {
    throw new Error(
      "تعذّر توليد العدد المطلوب من الأرقام الفريدة بطول الرقم الحالي. جرّب زيادة طول الرقم أو تقليل العدد."
    );
  }

  script += `/log info "اكتمال إنشاء المستخدمين للعميل ${rosStr(customer)} - العدد الإجمالي: ${count}";\n`;

  return { numbers, script };
}

export function buildFileName(params: {
  fileType: string;
  profile: string;
  prefix: string;
  count: number;
}): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeProfile = params.profile || "profile";
  const safePrefix = params.prefix || "0";
  return `${params.fileType}_${safeProfile}_${safePrefix}_${params.count}_${date}`;
}
