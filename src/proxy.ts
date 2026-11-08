import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh auth token (getUser validates the JWT with Supabase Auth)
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Gate the workspace app: signed-out visitors go to /login and return afterwards.
    // ECHO_DEMO_MODE="true" keeps the app open for public demos (shared demo identity).
    const { pathname, search } = request.nextUrl;
    const isProtected = pathname === "/app" || pathname.startsWith("/app/");
    if (isProtected && !user && process.env.ECHO_DEMO_MODE !== "true") {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.search = "";
        loginUrl.searchParams.set("next", `${pathname}${search}`);
        const redirect = NextResponse.redirect(loginUrl);
        // Preserve any refreshed auth cookies on the redirect response
        supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        return redirect;
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, sitemap.xml, robots.txt
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};

