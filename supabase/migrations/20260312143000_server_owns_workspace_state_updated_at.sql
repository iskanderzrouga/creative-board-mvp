create or replace function public.touch_workspace_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists workspace_state_set_updated_at on public.workspace_state;

create trigger workspace_state_set_updated_at
before insert or update on public.workspace_state
for each row
execute function public.touch_workspace_state_updated_at();
