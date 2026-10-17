-- =====================================================================
-- Obra ou serviço sem licença: área da intervenção (polígono) opcional.
-- Mesma regra da área dos trechos de licença: polígono válido e dentro da
-- faixa de Niterói.
-- =====================================================================
alter table public.intervencoes_sem_licenca
  add column area geometry(Polygon, 4326),
  add constraint intervencoes_sem_licenca_area_niteroi check (
    area is null or (
      ST_IsValid(area)
      and ST_XMin(area) >= -43.25 and ST_XMax(area) <= -42.85
      and ST_YMin(area) >= -23.10 and ST_YMax(area) <= -22.75));

create index intervencoes_sem_licenca_area_idx on public.intervencoes_sem_licenca using gist (area);
