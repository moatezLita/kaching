import { Suspense } from "react";
import Kaching from "@/components/Kaching";

export default function Page() {
  return (
    <Suspense>
      <Kaching />
    </Suspense>
  );
}
