import { BackgroundPaths } from "@/components/ui/background-paths";
import { LoginForm } from "@/components/ui/login-form";

export default function Home() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-neutral-950">
      <BackgroundPaths />
      <div className="relative z-10 w-full">
        <LoginForm />
      </div>
    </div>
  );
}
