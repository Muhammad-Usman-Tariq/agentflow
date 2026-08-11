import { useState } from 'react';

interface LoginFormProps {
  error?: string;
  isLoading?: boolean;
}

export function LoginForm({ error, isLoading }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="bg-[#faf9f7] min-h-screen flex items-center justify-center p-4 md:p-8 antialiased">
      <main className="bg-[#ffffff] border border-[#e8e4df] rounded-[16px] w-full max-w-[420px] p-[32px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] relative overflow-hidden">
        {/* Decorative subtle gradient hint */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#ffffff] via-[#a93011] to-[#ffffff] opacity-20" />

        <div className="text-center mb-[32px]">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#f5ece6] mb-4">
            <div className="i-ph:sparkle-fill text-[24px] text-[#a93011]" />
          </div>
          <h1 className="text-[24px] font-semibold text-[#1f1b17] mb-2 tracking-tight">Welcome Back</h1>
          <p className="text-[14px] text-[#9d9893]">Sign in to your DigitalSofts AI account.</p>
        </div>

        {error && (
          <div className="mb-[20px] px-4 py-3 rounded-lg bg-[#ffdad6] border border-[#ba1a1a]/30 text-[#93000a] text-sm">
            {error}
          </div>
        )}

        <form method="POST" action="/auth/login" className="space-y-[20px]">
          <div>
            <label className="block font-[#JetBrains_Mono,monospace] text-[11px] font-semibold text-[#1f1b17] mb-2 uppercase tracking-wider" htmlFor="email">
              Email Address
            </label>
            <input
              className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md text-[14px] text-[#1f1b17] px-4 py-3 focus:outline-none focus:border-[#a93011] focus:ring-1 focus:ring-[#a93011] transition-all duration-200"
              id="email"
              name="email"
              type="email"
              required
              placeholder="jane@example.com"
            />
          </div>

          <div>
            <label className="block font-[#JetBrains_Mono,monospace] text-[11px] font-semibold text-[#1f1b17] mb-2 uppercase tracking-wider" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                className="w-full bg-[#ffffff] border border-[#e8e4df] rounded-md text-[14px] text-[#1f1b17] px-4 py-3 focus:outline-none focus:border-[#a93011] focus:ring-1 focus:ring-[#a93011] transition-all duration-200 pr-10"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9d9893] hover:text-[#1f1b17]"
              >
                <div className={showPassword ? 'i-ph:eye-slash text-lg' : 'i-ph:eye text-lg'} />
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              className="w-full bg-[#a93011] text-white text-[16px] font-semibold rounded-lg py-3 hover:bg-[#ad3313] active:scale-[0.98] transition-all duration-200 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
              <div className="i-ph:arrow-right text-[18px]" />
            </button>
          </div>
        </form>

        <div className="mt-[32px] pt-[24px] border-t border-[#e8e4df] text-center">
          <p className="text-[14px] text-[#9d9893]">
            Don't have an account?{' '}
            <a className="text-[#a93011] hover:text-[#ad3313] font-semibold transition-colors duration-200 ml-1" href="/auth/signup">
              Sign Up
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}