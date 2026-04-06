import { NextResponse } from "next/server";

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

export function hostedModeGuard(): NextResponse | null {
  if (!IS_HOSTED) return null;
  return NextResponse.json(
    {
      error:
        "This feature is not available in hosted mode. Run the dashboard locally for full functionality.",
    },
    { status: 503 }
  );
}
