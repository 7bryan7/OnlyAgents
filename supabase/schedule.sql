-- Enable pg_cron and pg_net in Supabase Dashboard > Database > Extensions.
-- Add two secrets in Dashboard > Integrations > Vault:
--   onlyagent_origin: https://YOUR-PROJECT.vercel.app (no trailing slash)
--   onlyagent_cron_secret: same random 32+ character CRON_SECRET as Vercel
-- Run AFTER the production Vercel API works and those Vault entries exist.
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'onlyagent_origin')
     or not exists (select 1 from vault.decrypted_secrets where name = 'onlyagent_cron_secret') then
    raise exception 'Configure onlyagent_origin and onlyagent_cron_secret in Vault first';
  end if;
end; $$;

-- Re-running this script replaces the named schedule rather than duplicating it.
select cron.unschedule(jobid) from cron.job where jobname = 'onlyagent-tick';
select cron.schedule('onlyagent-tick', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'onlyagent_origin' limit 1) || '/api/jobs/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'onlyagent_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
$$);
