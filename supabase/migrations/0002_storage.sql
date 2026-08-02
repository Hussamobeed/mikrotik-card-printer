-- Creates the private 'library' Storage bucket used to store generated
-- TXT/PDF/XLSX/MikroTik-script files. Kept private: the Edge Function
-- (service-role key) is the only thing that reads/writes it directly;
-- downloads are served via short-lived signed URLs it generates on request.
insert into storage.buckets (id, name, public)
values ('library', 'library', false)
on conflict (id) do nothing;
