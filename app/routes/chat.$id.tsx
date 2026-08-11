import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getUser } from '~/lib/auth/session.server';
import { default as IndexRoute } from './_index';

export async function loader(args: LoaderFunctionArgs) {
  const user = await getUser(args.request);
  return json({ id: args.params.id, user });
}

export default IndexRoute;
