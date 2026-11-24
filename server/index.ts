import {createHandler} from './api.mjs';
Deno.serve(createHandler({
  url:Deno.env.get('SUPABASE_URL')!,
  key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  allowedOrigins:['https://xinyuya713.github.io','http://127.0.0.1:4173','http://localhost:4173']
}));
