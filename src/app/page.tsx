import { Cotador } from "@/components/Cotador";
import { vibeConfigured } from "@/lib/vibeClient";

export default function Home() {
  return <Cotador vibeEnabled={vibeConfigured()} />;
}
