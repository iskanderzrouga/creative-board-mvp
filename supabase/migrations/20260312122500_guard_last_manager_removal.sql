create or replace function public.prevent_last_manager_removal()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE' and old.role_mode = 'manager')
    or (tg_op = 'UPDATE' and old.role_mode = 'manager' and new.role_mode <> 'manager') then
    if (
      select count(*)
      from public.workspace_access access
      where access.role_mode = 'manager'
        and access.email <> old.email
    ) = 0 then
      raise exception 'Cannot remove the last workspace manager';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_last_manager on public.workspace_access;

create trigger guard_last_manager
before update or delete on public.workspace_access
for each row execute function public.prevent_last_manager_removal();
