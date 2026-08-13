import type { ServerBuild } from '@remix-run/cloudflare';
import { createPagesFunctionHandler } from '@remix-run/cloudflare-pages';

export const onRequest: PagesFunction = async (context) => {
  const serverBuild = (await import('../build/server')) as unknown as ServerBuild;

  const handler = createPagesFunctionHandler({
    build: serverBuild,
    getLoadContext: (context) => ({
      cloudflare: {
        env: context.env,
        cf: context.request.cf,
        ctx: context,
        caches: caches,
      },
    }) as any,
  });

  return handler(context);
};