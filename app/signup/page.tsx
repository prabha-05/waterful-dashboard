import { BackgroundPaths } from "@/components/ui/background-paths";
import { SignupForm } from "@/components/ui/signup-form";

export default function SignupPage() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-neutral-950">
      <BackgroundPaths />
      <SignupForm />
    </div>
  );
}
