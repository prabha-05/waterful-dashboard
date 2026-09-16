import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { LoginForm } from "@/components/ui/login-form";

export default function Home() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ background: "#080d1a" }}
    >
      <Card className="w-full max-w-md bg-black/[0.96] relative overflow-hidden border-slate-800">
        <Spotlight
          className="-top-40 left-0 md:left-60 md:-top-20"
          fill="white"
        />

        <div className="relative z-10 flex items-center justify-center p-8">
          <LoginForm />
        </div>
      </Card>
    </div>
  );
}
