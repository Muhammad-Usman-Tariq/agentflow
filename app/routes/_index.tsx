import { json, type MetaFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { getUser } from '~/lib/auth/session.server';
import { useLoaderData } from '@remix-run/react';

export const meta: MetaFunction = () => {
  return [{ title: 'DigitalSofts' }, { name: 'description', content: 'Build anything with AI - DigitalSofts' }];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  return json({ id: undefined, user });
}

/**
 * Landing page component for Bolt
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  const { user } = useLoaderData<typeof loader>();

  // ✅ Not logged in — show auth landing screen
  if (!user) {
    return <AuthLanding />;
  }

  // ✅ Logged in — show normal chat UI (existing code same)
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}

// ─── Auth Landing Screen ─────────────────────────────────
function AuthLanding() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 antialiased relative overflow-hidden"
      style={{
        backgroundColor: '#faf9f7',
        backgroundImage: `radial-gradient(circle at top right, rgba(203, 73, 39, 0.05) 0%, transparent 40%),
                          radial-gradient(circle at bottom left, rgba(203, 73, 39, 0.03) 0%, transparent 40%)`,
      }}
    >
      {/* Background decorative blur */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden mix-blend-multiply opacity-50">
        <div className="absolute -top-[20%] -right-[10%] w-[500px] h-[500px] rounded-full bg-[#ffb4a2] blur-[120px] opacity-20" />
      </div>

      <main className="w-full max-w-md bg-[#ffffff] rounded-2xl border border-[#e8e4df] p-8 md:p-12 relative overflow-hidden flex flex-col items-center text-center shadow-[0_10px_40px_-10px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]">
        {/* Logo Section */}
        <div className="mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-xl bg-[#fff8f4] border border-[#e8e4df] flex items-center justify-center mb-4 shadow-sm">
            <div className="i-ph:sparkle-fill text-[32px]" style={{ color: '#e85d3a' }} />
          </div>
          <h1 className="text-[32px] font-semibold text-[#1f1b17] tracking-tight leading-[1.2]">
            DigitalSofts
          </h1>
          <p className="text-[16px] text-[#5f5e5e] mt-2 leading-[1.6]">
            Build full-stack apps with AI
          </p>
        </div>

        {/* Action Buttons Stacking */}
        <div className="w-full flex flex-col gap-4">
          <a
            href="/auth/login"
            className="w-full py-3 px-4 rounded-lg font-[#JetBrains_Mono,monospace] text-[11px] font-semibold tracking-wider transition-colors duration-200 shadow-sm flex items-center justify-center gap-2 text-white bg-[#e85d3a] hover:bg-[#d14a28]"
          >
            Login
            <div className="i-ph:arrow-right text-[16px]" />
          </a>

          <a
            href="/auth/signup"
            className="w-full py-3 px-4 rounded-lg font-[#JetBrains_Mono,monospace] text-[11px] font-semibold tracking-wider transition-colors duration-200 flex items-center justify-center border border-[#e85d3a] text-[#e85d3a] hover:bg-[#e85d3a]/5"
          >
            Sign Up
          </a>

          {/* Divider */}
          <div className="flex items-center w-full my-2">
            <div className="flex-grow border-t border-[#e8e4df]" />
            <span className="px-3 font-[#JetBrains_Mono,monospace] text-[11px] font-semibold text-[#9d9893]">or</span>
            <div className="flex-grow border-t border-[#e8e4df]" />
          </div>

          <a
            href="/guest"
            className="w-full py-3 px-4 rounded-lg border border-[#e8e4df] bg-transparent text-[#5f5e5e] hover:bg-[#f5f4f2] font-[#JetBrains_Mono,monospace] text-[11px] font-semibold tracking-wider transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <div className="i-ph:user text-[16px]" />
            Continue as Guest
          </a>
        </div>

        {/* Footer / Warning */}
        <div className="mt-8 pt-6 border-t border-[#e8e4df] w-full text-center">
          <div className="flex items-center justify-center gap-2 text-[#9d9893] text-[13px]">
            <div className="i-ph:info text-[16px]" />
            <p>Guest mode does not save your projects</p>
          </div>
        </div>
      </main>
    </div>
  );
}