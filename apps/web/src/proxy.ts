import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cheap presence check only. The API verifies the session JWT on every request (401 → client redirects home).
export function proxy(request: NextRequest) {
  if (!request.cookies.has("ghbot_session")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
