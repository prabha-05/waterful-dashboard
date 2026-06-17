import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { LoginForm } from "@/components/ui/login-form";

export default function Home() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-950 p-4">
      <Card className="w-full max-w-5xl h-[600px] bg-black/[0.96] relative overflow-hidden border-neutral-800">
        <Spotlight
          className="-top-40 left-0 md:left-60 md:-top-20"
          fill="white"
        />

        <div className="flex h-full">
          {/* Left — Login form */}
          <div className="flex-1 relative z-10 flex items-center justify-center p-8">
            <LoginForm />
          </div>

          {/* Right — 3D scene */}
          <div className="flex-1 relative hidden md:block">
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
