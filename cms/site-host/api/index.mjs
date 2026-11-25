// Vercel function for the public staging site: every path is rewritten here (vercel.json) and served from Storage.
import { createSiteHandler } from '../serve.mjs';

const handler = createSiteHandler({ url: process.env.SUPABASE_URL, bucket: process.env.STORAGE_BUCKET || 'akcelport-site', manifest: 'current' });
export default handler;
