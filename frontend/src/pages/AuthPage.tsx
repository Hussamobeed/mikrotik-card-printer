import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabaseAuth } from "@/lib/supabaseClient";
import { useState } from "react";
import toast from "react-hot-toast";

export function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    const { error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
  }

  async function handleSignUp() {
    if (password.length < 6) {
      toast.error("كلمة المرور يجب ألا تقل عن 6 أحرف");
      return;
    }
    setLoading(true);
    const { error, data } = await supabaseAuth.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // If email confirmation is required in your Supabase Auth settings, there
    // will be no active session yet — the user must confirm via email first.
    if (!data.session) {
      setSignupDone(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl">Obaid Manager</CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            سجّل دخولك أو أنشئ حسابًا جديدًا للمتابعة
          </p>
        </CardHeader>
        <CardContent>
          {signupDone ? (
            <div className="space-y-3 text-center text-sm">
              <p>تم إنشاء الحساب بنجاح. تحقق من بريدك الإلكتروني لتأكيد الحساب قبل تسجيل الدخول.</p>
              <Button variant="outline" className="w-full" onClick={() => setSignupDone(false)}>
                رجوع
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="signin">
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="signin">تسجيل الدخول</TabsTrigger>
                <TabsTrigger value="signup">حساب جديد</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <div className="space-y-3">
                  <div>
                    <Label>البريد الإلكتروني</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label>كلمة المرور</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" disabled={loading} onClick={handleSignIn}>
                    تسجيل الدخول
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="signup">
                <div className="space-y-3">
                  <div>
                    <Label>البريد الإلكتروني</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label>كلمة المرور (6 أحرف على الأقل)</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" disabled={loading} onClick={handleSignUp}>
                    إنشاء حساب
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
