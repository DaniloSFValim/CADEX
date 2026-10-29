-- =====================================================================
-- Telecom: construção de caixa R2 e galeria entram no art. 10 da Resolução.
--
-- O código não aceita dígitos (regra do catálogo), por isso a caixa R2 usa
-- "caixa_r_dois"; o rótulo é o que aparece para o usuário.
-- =====================================================================

insert into public.tipos_intervencao (setor, codigo, rotulo, fonte) values
  ('telecom', 'caixa_r_dois', 'Construção de caixa R2', 'Art. 10 da Resolução (setor de telecomunicações).'),
  ('telecom', 'galeria', 'Construção de galeria', 'Art. 10 da Resolução (setor de telecomunicações).')
on conflict (setor, codigo) do nothing;
